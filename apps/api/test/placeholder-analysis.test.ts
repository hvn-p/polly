import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { DBOSClient } from '@dbos-inc/dbos-sdk'
import { submitPlaceholderAnalysis } from '@polly/back'
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest'
import { dbosAnalysisQueue } from '../src/entry/analysis/index.ts'

const workerProject = join(import.meta.dirname, '..', '..', '..', 'services', 'pron-worker')
// The interpreter of the worker's synced environment, run directly: killing it
// kills the worker itself, not a launcher in front of it.
const python = join(workerProject, '.venv', 'bin', 'python')
const workers: ChildProcess[] = []
let client: DBOSClient

// The fake analyzer, slowed down so the worker can be killed in the middle of
// a task; it says when it starts.
const SLOW_WORKER = `
import time
from pron_worker import analyzer
fake = analyzer.FakeAnalyzer.analyze
def slow(self, recording_id):
    print(f"analyzing {recording_id}", flush=True)
    time.sleep(60)
    return fake(self, recording_id)
analyzer.FakeAnalyzer.analyze = slow
import runpy
runpy.run_module("pron_worker", run_name="__main__")
`

// The real worker, in fake mode, on the worktree's test database; resolves
// once it runs, with its output so far and to come.
async function startWorker({ slow = false } = {}): Promise<{ worker: ChildProcess; output: () => string }> {
  const worker = spawn(python, slow ? ['-c', SLOW_WORKER] : ['-m', 'pron_worker'], {
    cwd: workerProject,
    env: { ...process.env, DATABASE_URL: inject('testDatabaseUrl'), POLLY_WORKER_MODE: 'fake' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  workers.push(worker)
  let output = ''
  await new Promise<void>((resolve, reject) => {
    const read = (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes('DBOS launched')) {
        resolve()
      }
    }
    worker.stdout?.on('data', read)
    worker.stderr?.on('data', read)
    worker.once('exit', (code) => reject(new Error(`the worker exited (${code}): ${output}`)))
  })
  return { worker, output: () => output }
}

async function until(condition: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('condition not met in time')
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

beforeAll(async () => {
  client = await DBOSClient.create({ systemDatabaseUrl: inject('testDatabaseUrl'), applicationName: 'polly' })
})

afterEach(async () => {
  for (const worker of workers.splice(0)) {
    if (worker.exitCode === null && worker.signalCode === null) {
      worker.kill()
      await once(worker, 'exit')
    }
  }
})

afterAll(async () => {
  await client?.destroy()
})

describe('placeholder analysis, across the API and the worker', { timeout: 120_000 }, () => {
  it('C29, C46: the fake worker returns its predefined result through the workflow handle, loading no model', async () => {
    await startWorker()
    const result = await submitPlaceholderAnalysis({ queue: dbosAnalysisQueue(client) }, 'recording-1')
    expect(result).toEqual({ recordingId: 'recording-1', score: 0.75, analyzer: 'fake', modelLoaded: false })
  })

  it('a worker killed in the middle of a task leaves exactly one result once a worker restarts', async () => {
    const startTime = new Date().toISOString()
    const slow = await startWorker({ slow: true })
    const result = submitPlaceholderAnalysis({ queue: dbosAnalysisQueue(client) }, 'recording-killed')
    await until(() => slow.output().includes('analyzing recording-killed'), 60_000)
    slow.worker.kill('SIGKILL')
    await once(slow.worker, 'exit')

    await startWorker()
    expect(await result).toEqual({
      recordingId: 'recording-killed',
      score: 0.75,
      analyzer: 'fake',
      modelLoaded: false,
    })
    const workflows = await client.listWorkflows({ startTime })
    expect(workflows.map(({ status, recoveryAttempts }) => ({ status, recoveryAttempts }))).toEqual([
      { status: 'SUCCESS', recoveryAttempts: 2 },
    ])
  })
})
