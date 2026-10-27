import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { afterAll, describe, expect, it } from 'vitest'
import { down } from '../src/commands/down.ts'
import { up } from '../src/commands/up.ts'
import { worker, workerProcess } from '../src/commands/worker.ts'
import { parseEnv } from '../src/config/index.ts'
import { tryLock } from '../src/machine/flock.ts'
import type { Infrastructure } from '../src/ports/index.ts'
import { groupMembers, processSupervisor } from '../src/supervisor/index.ts'
import { fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
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
  await up({ root, ...loaded(infra), out })
  const identity = parseEnv(readFileSync(join(root, '.env.local'), 'utf8')).get('POLLY_WORKTREE_ID') ?? ''
  return { root, infra, identity }
}

async function lockHeld(): Promise<boolean> {
  const lock = await tryLock(realWorkerLock)
  await lock?.release()
  return lock === undefined
}

// Another worktree's real worker: one process holding the lock, its name
// written in it, so killing that process frees the lock.
function holdRealWorker(): ChildProcess {
  return spawn('sh', [
    '-c',
    'exec 9>"$0" && flock 9 && printf other > "$0" && echo held && exec sleep 30',
    realWorkerLock,
  ])
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
    await up({ root: a.root, ...loaded(a.infra), out })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(await lockHeld()).toBe(false)
  })

  it('C31: refuses when another worktree takes the real worker between the check and the restart', async () => {
    const a = await worktree('feature/real-race')
    let holder: ChildProcess | undefined
    const start = a.infra.supervisor.start
    a.infra.supervisor.start = async (options) => {
      if (holder === undefined) {
        holder = holdRealWorker()
        await once(holder.stdout as Readable, 'data')
      }
      return start(options)
    }
    try {
      await expect(worker({ root: a.root, infra: a.infra, mode: 'real', out })).rejects.toMatchObject({
        code: 'REAL_WORKER_BUSY',
        message: expect.stringContaining('other'),
      })
      expect(modeOf(a.root)).toBe('fake')
    } finally {
      holder?.kill()
    }
  })

  it('C31: dev:up of a worktree left in real mode runs the fake worker while another holds the real one, and says so', async () => {
    const holder = holdRealWorker()
    try {
      await once(holder.stdout as Readable, 'data')
      const a = await worktree('feature/real-up')
      const envFile = join(a.root, '.env.local')
      writeFileSync(
        envFile,
        readFileSync(envFile, 'utf8').replace(/^POLLY_WORKER_MODE=.*$/m, 'POLLY_WORKER_MODE=real'),
      )
      const { supervisor } = JSON.parse(readFileSync(join(a.root, '.dev/state.json'), 'utf8')) as {
        supervisor: { pid: number }
      }
      await a.infra.supervisor.stop(supervisor)
      const lines: string[] = []
      await up({ root: a.root, ...loaded(a.infra), out: (line) => lines.push(line) })
      expect(modeOf(a.root)).toBe('fake')
      expect(lines).toContainEqual(expect.stringMatching(/worker: fake.*real worker runs for other/))
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(readFileSync(realWorkerLock, 'utf8')).toBe('other')
    } finally {
      holder.kill()
    }
  })

  it('refuses on a worktree whose Polly is not running, and starts nothing', async () => {
    const a = await worktree('feature/worker-down')
    const { supervisor } = JSON.parse(readFileSync(join(a.root, '.dev/state.json'), 'utf8')) as {
      supervisor: { pid: number }
    }
    await a.infra.supervisor.stop(supervisor)
    let started = false
    a.infra.supervisor.start = async () => {
      started = true
      return supervisor
    }
    await expect(worker({ root: a.root, infra: a.infra, mode: 'fake', out })).rejects.toMatchObject({
      code: 'WORKTREE_NOT_RUNNING',
      message: expect.stringContaining('nr dev:up'),
    })
    expect(started).toBe(false)
  })

  it('waits for a dev:up running in the worktree before it restarts the worker', async () => {
    const a = await worktree('feature/worker-wait')
    const holder = spawn('flock', [join(a.root, '.dev/up.lock'), 'sh', '-c', 'echo held; sleep 1'])
    await once(holder.stdout, 'data')
    const released = once(holder, 'exit').then(() => Date.now())
    let startedAt = 0
    const start = a.infra.supervisor.start
    a.infra.supervisor.start = async (options) => {
      startedAt = Date.now()
      return start(options)
    }
    await worker({ root: a.root, infra: a.infra, mode: 'fake', out })
    expect(startedAt).toBeGreaterThanOrEqual(await released)
  })

  it('refuses a mode other than real or fake', async () => {
    const a = await worktree('feature/mode')
    await expect(worker({ root: a.root, infra: a.infra, mode: 'turbo', out })).rejects.toMatchObject({
      code: 'UNKNOWN_WORKER_MODE',
    })
  })
})
