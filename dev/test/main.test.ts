import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { launchInteractive } from '../src/commands/agent.ts'
import { prerequisites } from '../src/infra/prerequisites.ts'
import { run } from '../src/main.ts'
import { fakeInfrastructure } from './support/fake-infrastructure.ts'
import { temporaryRepository } from './support/repository.ts'

function io(cwd: string, infra = fakeInfrastructure()) {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    io: { cwd, stdout: (l: string) => stdout.push(l), stderr: (l: string) => stderr.push(l), infra },
  }
}

describe('dev command line', () => {
  it('runs up, url, worker and down in a worktree', async () => {
    const root = temporaryRepository()
    const { stdout, io: options } = io(root)
    expect(await run(['up'], options)).toBe(0)
    expect(await run(['url'], options)).toBe(0)
    expect(await run(['worker', 'fake'], options)).toBe(0)
    expect(await run(['down'], options)).toBe(0)
    const url = readFileSync(join(root, '.env.local'), 'utf8').match(/^PUBLIC_URL=(.*)$/m)?.[1]
    expect(stdout).toEqual([url, url, 'worker: fake', expect.stringMatching(/^released /)])
  })

  it('refuses an unknown worker mode with exit 1', async () => {
    const { stderr, io: options } = io(temporaryRepository())
    await run(['up'], options)
    expect(await run(['worker', 'turbo'], options)).toBe(1)
    expect(stderr).toEqual([expect.stringMatching(/^UNKNOWN_WORKER_MODE: /)])
  })

  it('uses the real infrastructure when none is given, touching nothing on a worktree never set up', async () => {
    const stdout: string[] = []
    const status = await run(['down'], {
      cwd: temporaryRepository(),
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
    })
    expect(status).toBe(0)
    expect(stdout).toEqual(['nothing to release'])
  })
})

describe('machine adapters', () => {
  it('launches an interactive command and returns its exit status', async () => {
    expect(await launchInteractive('sh', ['-c', 'exit 3'], process.env)).toBe(3)
  })

  it('probes the machine for its prerequisites, naming what is missing', async () => {
    const missing = await prerequisites.missing()
    expect(
      missing === undefined ||
        ['docker', 'docker compose', 'flock', 'portless', 'uv', 'pnpm'].includes(missing) ||
        missing.startsWith('the portless proxy'),
    ).toBe(true)
  })
})
