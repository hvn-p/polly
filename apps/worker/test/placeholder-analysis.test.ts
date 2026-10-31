import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { DBOSClient } from '@dbos-inc/dbos-sdk'
import { submitPlaceholderAnalysis } from '@polly/back'
import { dbosAnalysisQueue } from '@polly/queue'
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest'
import { buildWorker, STARTED } from './support/build.ts'

let main = ''
let slowWorker = ''
const workers: ChildProcess[] = []
let client: DBOSClient

// The worker process, in fake mode, on the worktree's test database; resolves
// once it runs, with its output so far and to come.
async function startWorker({ slow = false } = {}): Promise<{ worker: ChildProcess; output: () => string }> {
  const worker = spawn(process.execPath, [slow ? slowWorker : main], {
    env: {
      ...process.env,
      DATABASE_URL: inject('testDatabaseUrl'),
      POLLY_ENV: 'local',
      POLLY_WORKER_MODE: 'fake',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  workers.push(worker)
  let output = ''
  await new Promise<void>((resolve, reject) => {
    const read = (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes(STARTED)) {
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
  main = await buildWorker('main')
  slowWorker = await buildWorker('slow-worker')
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

describe('placeholder analysis, across the queue and the worker', { timeout: 120_000 }, () => {
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
