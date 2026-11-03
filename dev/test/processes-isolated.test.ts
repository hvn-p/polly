// The worktree's processes as its Compose project runs them: a crash is
// restarted, a process that cannot start stops dev:up, and only a process's
// own build restarts it.

import { execFileSync } from 'node:child_process'
import { existsSync, linkSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { up } from '../src/commands/up.ts'
import { loaded } from './support/fake-infrastructure.ts'
import { isolatedInfrastructure } from './support/isolated-infrastructure.ts'
import { envOf, isolatedWorktreeInfrastructure, stateOf, testProcesses } from './support/isolated-worktree.ts'
import { temporaryRepository } from './support/repository.ts'
import { until } from './support/until.ts'

const codeRoot = join(import.meta.dirname, '..', '..')

let shared: Awaited<ReturnType<typeof isolatedInfrastructure>>
const processes = testProcesses()
const root = temporaryRepository('feature/processes')

beforeAll(async () => {
  shared = await isolatedInfrastructure()
  await up({ root, ...loaded(infrastructure()), out: () => undefined, warn: () => undefined })
}, 240_000)

afterAll(async () => {
  await processes.removeAll()
  shared.destroy()
})

function infrastructure() {
  return isolatedWorktreeInfrastructure(shared, processes)
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

// How many times nodemon started a process, from its log.
function starts(process: string): number {
  const log = join(root, '.dev/logs', `${process}.log`)
  return existsSync(log) ? (readFileSync(log, 'utf8').match(/\[nodemon\] starting /g) ?? []).length : 0
}

function startsOfEach(): Record<string, number> {
  return Object.fromEntries(['api', 'mcp', 'worker'].map((process) => [process, starts(process)]))
}

function setEnv(key: string, value: string): void {
  const file = join(root, '.env.local')
  writeFileSync(file, readFileSync(file, 'utf8').replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`))
}

// The host PID of the API's own process, under nodemon in its container.
function apiPid(): number {
  const container = execFileSync(
    'docker',
    [
      'ps',
      '--quiet',
      '--filter',
      `label=com.docker.compose.project=${stateOf(root).project}`,
      '--filter',
      'label=com.docker.compose.service=api',
    ],
    { encoding: 'utf8' },
  ).trim()
  const line = execFileSync('docker', ['top', container, '-eo', 'pid,args'], { encoding: 'utf8' })
    .split('\n')
    .find((each) => each.includes('apps/api/dist/main.js') && !each.includes('nodemon'))
  return Number(line?.trim().split(/\s+/)[0])
}

describe("the worktree's processes", { timeout: 120_000 }, () => {
  it('C75: a killed API answers again within 5 s, with no command run', async () => {
    const port = Number(envOf(root)['POLLY_API_PORT'])
    expect(await accepts(port)).toBe(true)
    process.kill(apiPid(), 'SIGKILL')
    await until(async () => !(await accepts(port)), 2000)
    const killedAt = Date.now()
    await until(() => accepts(port), 10_000)
    expect(Date.now() - killedAt).toBeLessThan(5000)
  })

  it('C77: a hard link added under node_modules, and a source change that leaves the build unchanged, restart nothing', async () => {
    await sleep(3000)
    const before = startsOfEach()
    // A file of the store pnpm shares between worktrees, under the API's dependencies.
    const hono = realpathSync(join(codeRoot, 'apps/api/node_modules/hono/package.json'))
    const link = join(dirname(hono), 'package.json.hard-link')
    linkSync(hono, link)
    const source = join(codeRoot, 'apps/api/src/main.ts')
    writeFileSync(source, readFileSync(source))
    try {
      await sleep(4000)
      expect(startsOfEach()).toEqual(before)
    } finally {
      rmSync(link, { force: true })
    }
  })

  it("C77: a change of the API's build output restarts the API only", async () => {
    const before = startsOfEach()
    const build = join(codeRoot, 'apps/api/dist/main.js')
    const original = readFileSync(build)
    writeFileSync(build, `${original}\n// a rebuild\n`)
    try {
      await until(() => starts('api') === (before['api'] ?? 0) + 1, 10_000)
      await sleep(2000)
      expect(startsOfEach()).toEqual({ ...before, api: (before['api'] ?? 0) + 1 })
    } finally {
      writeFileSync(build, original)
    }
  })

  it('C76: a process that fails at start refuses dev:up naming it, and no URL is printed; once fixed, dev:up succeeds', async () => {
    // A valid address the API cannot listen on: only the API listens on it.
    setEnv('POLLY_API_HOST', '192.0.2.1')
    const lines: string[] = []
    try {
      await expect(
        up({ root, ...loaded(infrastructure()), out: (line) => lines.push(line), warn: () => undefined }),
      ).rejects.toMatchObject({ code: 'PROCESS_NOT_READY', message: expect.stringMatching(/^api is /) })
      expect(lines).toEqual([])
    } finally {
      setEnv('POLLY_API_HOST', '127.0.0.1')
    }
    await up({ root, ...loaded(infrastructure()), out: (line) => lines.push(line), warn: () => undefined })
    expect(lines).toEqual([envOf(root)['PUBLIC_URL']])
  })
})
