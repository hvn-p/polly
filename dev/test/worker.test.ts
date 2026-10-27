import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { down } from '../src/commands/down.ts'
import { up } from '../src/commands/up.ts'
import { worker, workerProcess } from '../src/commands/worker.ts'
import { parseEnv } from '../src/config/index.ts'
import { tryLock } from '../src/infra/flock.ts'
import type { Infrastructure } from '../src/infra/ports.ts'
import { groupMembers, processSupervisor } from '../src/supervisor/index.ts'
import { fakeInfrastructure } from './support/fake-infrastructure.ts'
import { temporaryRepository } from './support/repository.ts'
import { until } from './support/until.ts'

const realWorkerLock = join(mkdtempSync(join(tmpdir(), 'real-worker-')), 'real-worker.lock')
const supervisors: number[] = []

afterAll(async () => {
  for (const pid of supervisors) {
    await processSupervisor().stop({ pid })
  }
})

// Faked infrastructure, but a real supervisor running a stand-in worker under
// the real worker's lock.
function infrastructure(): Infrastructure {
  const supervisor = processSupervisor()
  return {
    ...fakeInfrastructure(),
    realWorkerLock,
    application: {
      ...fakeInfrastructure().application,
      processes: (env) => [
        workerProcess(env, realWorkerLock, {
          name: 'worker',
          command: process.execPath,
          args: ['-e', 'setInterval(() => {}, 1000)'],
          cwd: '/',
        }),
      ],
    },
    supervisor: {
      ...supervisor,
      start: async (options) => {
        const state = await supervisor.start(options)
        supervisors.push(state.pid)
        return state
      },
    },
  }
}

const out = () => undefined

async function worktree(branch: string) {
  const root = temporaryRepository(branch)
  const infra = infrastructure()
  await up({ root, infra, out })
  const identity = parseEnv(readFileSync(join(root, '.env.local'), 'utf8')).get('POLLY_WORKTREE_ID') ?? ''
  return { root, infra, identity }
}

async function lockHeld(): Promise<boolean> {
  const lock = await tryLock(realWorkerLock)
  await lock?.release()
  return lock === undefined
}

function modeOf(root: string): string | undefined {
  return parseEnv(readFileSync(join(root, '.env.local'), 'utf8')).get('POLLY_WORKER_MODE')
}

describe('dev:worker', { timeout: 30_000 }, () => {
  it('C30, C31, C32: one real worker on the machine; a dead holder frees it', async () => {
    const a = await worktree('feature/real-a')
    const b = await worktree('feature/real-b')

    await worker({ root: a.root, infra: a.infra, mode: 'real', out })
    expect(modeOf(a.root)).toBe('real')
    await until(lockHeld)
    await until(() => readFileSync(realWorkerLock, 'utf8') === a.identity)

    await expect(worker({ root: b.root, infra: b.infra, mode: 'real', out })).rejects.toMatchObject({
      code: 'REAL_WORKER_BUSY',
      message: expect.stringContaining(a.identity),
    })
    expect(modeOf(b.root)).toBe('fake')

    const state = JSON.parse(readFileSync(join(a.root, '.dev/state.json'), 'utf8')) as {
      supervisor: { pid: number }
    }
    for (const pid of groupMembers(state.supervisor.pid)) {
      if (pid !== state.supervisor.pid) {
        process.kill(pid, 'SIGKILL')
      }
    }
    await until(async () => !(await lockHeld()), 1500)
    await worker({ root: b.root, infra: b.infra, mode: 'real', out })
    await until(() => readFileSync(realWorkerLock, 'utf8') === b.identity)

    await worker({ root: b.root, infra: b.infra, mode: 'fake', out })
    expect(modeOf(b.root)).toBe('fake')
    await until(async () => !(await lockHeld()))
    await worker({ root: a.root, infra: a.infra, mode: 'fake', out })
  })

  it('C33: dev:down on the worktree holding the real worker frees it', async () => {
    const a = await worktree('feature/real-down')
    await worker({ root: a.root, infra: a.infra, mode: 'real', out })
    await until(lockHeld)
    await down({ root: a.root, infra: a.infra, out })
    expect(await lockHeld()).toBe(false)
  })

  it('C19: dev:down puts the worker back in fake mode, so the next dev:up runs the fake worker', async () => {
    const a = await worktree('feature/real-reset')
    await worker({ root: a.root, infra: a.infra, mode: 'real', out })
    await until(lockHeld)
    await down({ root: a.root, infra: a.infra, out })
    expect(modeOf(a.root)).toBe('fake')
    await up({ root: a.root, infra: a.infra, out })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(await lockHeld()).toBe(false)
  })

  it('refuses a mode other than real or fake', async () => {
    const a = await worktree('feature/mode')
    await expect(worker({ root: a.root, infra: a.infra, mode: 'turbo', out })).rejects.toMatchObject({
      code: 'UNKNOWN_WORKER_MODE',
    })
  })
})
