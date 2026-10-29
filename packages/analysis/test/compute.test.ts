import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeAnalyzer } from '../src/index.ts'

const service = join(import.meta.dirname, '..', '..', '..', 'services', 'compute')
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
let container = ''
let baseUrl = ''

// The compute service in its container, built from the worktree's sources, on
// a loopback port of its own.
beforeAll(async () => {
  docker('build', '--quiet', '--tag', 'polly-compute:test', service)
  container = docker('run', '--detach', '--rm', '--publish', '127.0.0.1::8000', 'polly-compute:test')
  baseUrl = `http://${docker('port', container, '8000/tcp').split('\n')[0]}`
  const deadline = Date.now() + 30_000
  while (
    !(await fetch(`${baseUrl}/openapi.json`).then(
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

describe('the compute service, through its generated client', () => {
  it('analyzes a recording', async () => {
    expect(await computeAnalyzer({ baseUrl }).analyze('rec-1')).toEqual({
      recordingId: 'rec-1',
      score: 0.5,
      analyzer: 'model',
      modelLoaded: false,
    })
  })
})
