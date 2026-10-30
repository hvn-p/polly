import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { down } from '../src/commands/down.ts'
import { up } from '../src/commands/up.ts'
import { worker } from '../src/commands/worker.ts'
import { parseEnv } from '../src/config/index.ts'
import type { Infrastructure } from '../src/ports/index.ts'
import { processSupervisor } from '../src/supervisor/index.ts'
import { type FakeCompute, fakeCompute, fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
import { holdLock } from './support/lock-holder.ts'
import { temporaryRepository } from './support/repository.ts'

const supervisors: number[] = []

afterAll(async () => {
  for (const pid of supervisors) {
    await processSupervisor().stop({ pid })
  }
})

// Faked infrastructure, the machine's compute services shared by the
// worktrees of a test, and a real supervisor running a stand-in worker.
function infrastructure(compute: FakeCompute): Infrastructure & { calls: string[] } {
  const supervisor = processSupervisor()
  const fake = fakeInfrastructure()
  return {
    ...fake,
    compute,
    application: {
      ...fake.application,
      processes: () => [
        { name: 'worker', command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: '/' },
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

async function worktree(branch: string, compute: FakeCompute, fingerprint = 'fp-main') {
  const root = temporaryRepository(branch)
  compute.fingerprints.set(root, fingerprint)
  const infra = infrastructure(compute)
  await up({ root, ...loaded(infra), out: () => undefined, warn: () => undefined })
  const identity = envOf(root).get('POLLY_WORKTREE_ID') ?? ''
  return { root, infra, identity }
}

function envOf(root: string): Map<string, string> {
  return parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
}

function stopSupervisor(root: string, infra: Infrastructure): Promise<void> {
  const { supervisor } = JSON.parse(readFileSync(join(root, '.dev/state.json'), 'utf8')) as {
    supervisor: { pid: number }
  }
  return infra.supervisor.stop(supervisor)
}

describe('dev:worker', { timeout: 30_000 }, () => {
  it('C30: two worktrees with the same compute-service code reach the machine one service', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/same-a', compute)
    const b = await worktree('feature/same-b', compute)
    const lines: string[] = []
    await worker({
      root: a.root,
      infra: a.infra,
      mode: 'real',
      out: (line) => lines.push(line),
      warn: (line) => lines.push(line),
    })
    await worker({
      root: b.root,
      infra: b.infra,
      mode: 'real',
      out: (line) => lines.push(line),
      warn: (line) => lines.push(line),
    })

    expect(compute.calls).toEqual(['compute.start fp-main'])
    expect(envOf(a.root).get('POLLY_COMPUTE_URL')).toBe(compute.urlOf('fp-main'))
    expect(envOf(b.root).get('POLLY_COMPUTE_URL')).toBe(compute.urlOf('fp-main'))
    expect(envOf(b.root).get('POLLY_COMPUTE_FINGERPRINT')).toBe('fp-main')
    expect(envOf(b.root).get('POLLY_WORKER_MODE')).toBe('real')
    expect(lines).toEqual(['worker: real', 'worker: real'])
  })

  it('C31: a worktree whose compute-service code differs runs its own service, and says so', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/own-a', compute)
    const b = await worktree('feature/own-b', compute, 'fp-b')
    await worker({ root: a.root, infra: a.infra, mode: 'real', out: () => undefined, warn: () => undefined })
    const lines: string[] = []
    await worker({
      root: b.root,
      infra: b.infra,
      mode: 'real',
      out: (line) => lines.push(line),
      warn: (line) => lines.push(line),
    })

    expect(compute.calls).toEqual(['compute.start fp-main', 'compute.start fp-b'])
    expect(envOf(b.root).get('POLLY_COMPUTE_URL')).toBe(compute.urlOf('fp-b'))
    expect(lines).toEqual([
      expect.stringMatching(/^compute: this worktree runs its own service, fp-b, .*fp-main/),
      'worker: real',
    ])
  })

  it('a dev:up whose supervisor fails to start after taking a compute service leaves it for dev:down to release', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/leak-a', compute)
    const envFile = join(a.root, '.env.local')
    writeFileSync(
      envFile,
      readFileSync(envFile, 'utf8').replace(/^POLLY_WORKER_MODE=.*$/m, 'POLLY_WORKER_MODE=real'),
    )
    await stopSupervisor(a.root, a.infra)
    const failing: Infrastructure = {
      ...a.infra,
      supervisor: {
        ...a.infra.supervisor,
        start: async () => {
          throw new Error('the supervisor did not start')
        },
      },
    }
    await expect(
      up({ root: a.root, ...loaded(failing), out: () => undefined, warn: () => undefined }),
    ).rejects.toThrow('the supervisor did not start')
    expect(compute.users.get('fp-main')).toEqual(new Set([a.identity]))

    await down({ root: a.root, infra: a.infra, out: () => undefined })
    expect(compute.users.has('fp-main')).toBe(false)
  })

  it('C31: dev:up of a worktree left in real mode starts its service, and says when it is its own', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/up-a', compute)
    await worker({ root: a.root, infra: a.infra, mode: 'real', out: () => undefined, warn: () => undefined })
    const b = await worktree('feature/up-b', compute, 'fp-b')
    const envFile = join(b.root, '.env.local')
    writeFileSync(
      envFile,
      readFileSync(envFile, 'utf8').replace(/^POLLY_WORKER_MODE=.*$/m, 'POLLY_WORKER_MODE=real'),
    )
    await stopSupervisor(b.root, b.infra)
    const lines: string[] = []
    await up({
      root: b.root,
      ...loaded(b.infra),
      out: (line) => lines.push(line),
      warn: (line) => lines.push(line),
    })

    expect(compute.calls).toEqual(['compute.start fp-main', 'compute.start fp-b'])
    expect(envOf(b.root).get('POLLY_COMPUTE_URL')).toBe(compute.urlOf('fp-b'))
    expect(lines).toContainEqual(expect.stringMatching(/^compute: this worktree runs its own service, fp-b/))
  })

  it('C31: dev:up on a running real-mode worktree whose compute code changed switches to its own service, and says so', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/changed-a', compute)
    await worker({ root: a.root, infra: a.infra, mode: 'real', out: () => undefined, warn: () => undefined })
    const b = await worktree('feature/changed-b', compute)
    await worker({ root: b.root, infra: b.infra, mode: 'real', out: () => undefined, warn: () => undefined })
    const before = JSON.parse(readFileSync(join(b.root, '.dev/state.json'), 'utf8')) as {
      supervisor: { pid: number }
    }
    compute.fingerprints.set(b.root, 'fp-b')
    const lines: string[] = []
    await up({ root: b.root, ...loaded(b.infra), out: () => undefined, warn: (line) => lines.push(line) })

    expect(compute.calls).toEqual(['compute.start fp-main', 'compute.start fp-b'])
    expect(envOf(b.root).get('POLLY_COMPUTE_URL')).toBe(compute.urlOf('fp-b'))
    expect(envOf(b.root).get('POLLY_COMPUTE_FINGERPRINT')).toBe('fp-b')
    expect(lines).toContainEqual(expect.stringMatching(/^compute: this worktree runs its own service, fp-b/))
    const after = JSON.parse(readFileSync(join(b.root, '.dev/state.json'), 'utf8')) as {
      supervisor: { pid: number }
      compute: string
    }
    expect(after.compute).toBe('fp-b')
    expect(after.supervisor.pid).not.toBe(before.supervisor.pid)
  })

  it('a worktree pointed on purpose at another version keeps it when its own code changes, and dev:up warns naming both', async () => {
    const compute = fakeCompute()
    compute.images.add('fp-other')
    const a = await worktree('feature/kept-a', compute)
    await worker({
      root: a.root,
      infra: a.infra,
      mode: 'real',
      compute: 'fp-other',
      out: () => undefined,
      warn: () => undefined,
    })
    compute.fingerprints.set(a.root, 'fp-new')
    const lines: string[] = []
    await up({ root: a.root, ...loaded(a.infra), out: () => undefined, warn: (line) => lines.push(line) })

    expect(envOf(a.root).get('POLLY_COMPUTE_URL')).toBe(compute.urlOf('fp-other'))
    expect(envOf(a.root).get('POLLY_COMPUTE_FINGERPRINT')).toBe('fp-new')
    expect(lines).toContainEqual(expect.stringMatching(/^COMPUTE_VERSION_MISMATCH: .*fp-other.*fp-new/))
  })

  it('C32: pointed on purpose at another version, the worker runs, and the command warns naming both', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/version-a', compute)
    const b = await worktree('feature/version-b', compute, 'fp-b')
    await worker({ root: a.root, infra: a.infra, mode: 'real', out: () => undefined, warn: () => undefined })
    const lines: string[] = []
    await worker({
      root: b.root,
      infra: b.infra,
      mode: 'real',
      compute: 'fp-main',
      out: (line) => lines.push(line),
      warn: (line) => lines.push(line),
    })

    expect(compute.calls).toEqual(['compute.start fp-main'])
    expect(envOf(b.root).get('POLLY_COMPUTE_URL')).toBe(compute.urlOf('fp-main'))
    expect(envOf(b.root).get('POLLY_COMPUTE_FINGERPRINT')).toBe('fp-b')
    expect(lines).toEqual([
      expect.stringMatching(/^COMPUTE_VERSION_MISMATCH: .*fp-main.*fp-b/),
      'worker: real',
    ])
  })

  it('refuses a version whose service the machine cannot start, and leaves the worker as it was', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/version-unknown', compute)
    await expect(
      worker({
        root: a.root,
        infra: a.infra,
        mode: 'real',
        compute: 'fp-gone',
        out: () => undefined,
        warn: () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_COMPUTE_VERSION', message: expect.stringContaining('fp-gone') })
    expect(envOf(a.root).get('POLLY_WORKER_MODE')).toBe('fake')
  })

  it("C33: dev:down on a worktree running its own service stops it; the machine's shared one is untouched", async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/down-a', compute)
    const b = await worktree('feature/down-b', compute, 'fp-b')
    const c = await worktree('feature/down-c', compute)
    for (const { root, infra } of [a, b, c]) {
      await worker({ root, infra, mode: 'real', out: () => undefined, warn: () => undefined })
    }
    await down({ root: b.root, infra: b.infra, out: () => undefined })
    await down({ root: a.root, infra: a.infra, out: () => undefined })

    expect(compute.calls).toEqual(['compute.start fp-main', 'compute.start fp-b', 'compute.stop fp-b'])
    expect([...compute.users.keys()]).toEqual(['fp-main'])
  })

  it('back to fake, the worktree no longer uses its service, which stops once no worktree does', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/fake-again', compute)
    await worker({ root: a.root, infra: a.infra, mode: 'real', out: () => undefined, warn: () => undefined })
    await worker({ root: a.root, infra: a.infra, mode: 'fake', out: () => undefined, warn: () => undefined })
    expect(compute.calls).toEqual(['compute.start fp-main', 'compute.stop fp-main'])
    expect(envOf(a.root).get('POLLY_WORKER_MODE')).toBe('fake')
  })

  it('C19: dev:down puts the worker back in fake mode, so the next dev:up starts no compute service', async () => {
    const compute = fakeCompute()
    const a = await worktree('feature/real-reset', compute)
    await worker({ root: a.root, infra: a.infra, mode: 'real', out: () => undefined, warn: () => undefined })
    await down({ root: a.root, infra: a.infra, out: () => undefined })
    expect(envOf(a.root).get('POLLY_WORKER_MODE')).toBe('fake')
    await up({ root: a.root, ...loaded(a.infra), out: () => undefined, warn: () => undefined })
    expect(compute.calls).toEqual(['compute.start fp-main', 'compute.stop fp-main'])
  })

  it('refuses on a worktree whose Polly is not running, and starts nothing', async () => {
    const a = await worktree('feature/worker-down', fakeCompute())
    await stopSupervisor(a.root, a.infra)
    let started = false
    a.infra.supervisor.start = async () => {
      started = true
      return { pid: 0 }
    }
    await expect(
      worker({ root: a.root, infra: a.infra, mode: 'fake', out: () => undefined, warn: () => undefined }),
    ).rejects.toMatchObject({
      code: 'WORKTREE_NOT_RUNNING',
      message: expect.stringContaining('nr dev:up'),
    })
    expect(started).toBe(false)
  })

  it('waits for a dev:up running in the worktree before it restarts the worker', async () => {
    const a = await worktree('feature/worker-wait', fakeCompute())
    await holdLock(join(a.root, '.dev/up.lock'), 1)
    const heldAt = Date.now()
    let startedAt = 0
    const start = a.infra.supervisor.start
    a.infra.supervisor.start = async (options) => {
      startedAt = Date.now()
      return start(options)
    }
    await worker({ root: a.root, infra: a.infra, mode: 'fake', out: () => undefined, warn: () => undefined })
    // The lock is released when the holder exits, which Node may notice after the worker command does.
    expect(startedAt - heldAt).toBeGreaterThan(900)
  })

  it('refuses a mode other than real or fake', async () => {
    const a = await worktree('feature/mode', fakeCompute())
    await expect(
      worker({ root: a.root, infra: a.infra, mode: 'turbo', out: () => undefined, warn: () => undefined }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_WORKER_MODE',
    })
  })
})
