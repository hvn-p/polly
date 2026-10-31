import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { buildWorker, STARTED } from './support/build.ts'

let main = ''
const service = join(import.meta.dirname, '..', '..', '..', 'services', 'compute')
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
let container = ''
let computeUrl = ''

// The compute service in its container, reporting another version's
// fingerprint than the worktree's.
beforeAll(async () => {
  main = await buildWorker('main')
  docker('build', '--quiet', '--tag', 'polly-compute:test', service)
  container = docker(
    'run',
    '--detach',
    '--rm',
    '--env',
    'POLLY_COMPUTE_FINGERPRINT=0000other000',
    '--publish',
    '127.0.0.1::8000',
    'polly-compute:test',
  )
  computeUrl = `http://${docker('port', container, '8000/tcp').split('\n')[0]}`
  const deadline = Date.now() + 30_000
  while (
    !(await fetch(`${computeUrl}/version`).then(
      (r) => r.ok,
      () => false,
    ))
  ) {
    if (Date.now() > deadline) {
      throw new Error(`the compute service did not start: ${docker('logs', container)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}, 300_000)

afterAll(() => {
  if (container !== '') {
    docker('rm', '--force', container)
  }
})

describe("the worker's compute service", { timeout: 60_000 }, () => {
  it('C32: another version than the worktree warns of the mismatch naming both, and the worker runs', async () => {
    const worker = spawn(process.execPath, [main], {
      env: {
        ...process.env,
        DATABASE_URL: inject('testDatabaseUrl'),
        POLLY_ENV: 'local',
        POLLY_WORKER_MODE: 'real',
        POLLY_COMPUTE_URL: computeUrl,
        POLLY_COMPUTE_FINGERPRINT: '0000mine0000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    worker.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    try {
      const deadline = Date.now() + 30_000
      while (!output.includes(STARTED)) {
        if (Date.now() > deadline || worker.exitCode !== null) {
          throw new Error(`the worker did not start: ${output}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      const warning = output
        .split('\n')
        .filter((line) => line.includes('worker.compute_version.mismatched'))
        .map((line) => JSON.parse(line) as Record<string, unknown>)
      expect(warning).toEqual([
        expect.objectContaining({ level: 'warn', worktree: '0000mine0000', service: '0000other000' }),
      ])
    } finally {
      worker.kill()
      await once(worker, 'exit')
    }
  })
})
