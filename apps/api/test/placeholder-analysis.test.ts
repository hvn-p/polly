import { type ChildProcess, spawn } from 'node:child_process'
import { join } from 'node:path'
import { DBOSClient } from '@dbos-inc/dbos-sdk'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { dbosAnalysisQueue } from '../src/entry/analysis/index.ts'
import { submitPlaceholderAnalysis } from '../src/flows/submit-placeholder-analysis/index.ts'

const workerProject = join(import.meta.dirname, '..', '..', '..', 'services', 'pron-worker')
let worker: ChildProcess
let client: DBOSClient

// The real worker, in fake mode, on the worktree's test database.
beforeAll(async () => {
  worker = spawn('uv', ['run', '--quiet', '--project', workerProject, 'python', '-m', 'pron_worker'], {
    cwd: workerProject,
    env: { ...process.env, DATABASE_URL: inject('testDatabaseUrl'), POLLY_WORKER_MODE: 'fake' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((resolve, reject) => {
    let output = ''
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
  client = await DBOSClient.create({ systemDatabaseUrl: inject('testDatabaseUrl'), applicationName: 'polly' })
}, 120_000)

afterAll(async () => {
  await client?.destroy()
  worker?.kill()
})

describe('placeholder analysis, across the API and the worker', { timeout: 60_000 }, () => {
  it('C29, C46: the fake worker returns its predefined result through the workflow handle, loading no model', async () => {
    const result = await submitPlaceholderAnalysis(dbosAnalysisQueue(client), 'recording-1')
    expect(result).toEqual({ recordingId: 'recording-1', score: 0.75, analyzer: 'fake', modelLoaded: false })
  })
})
