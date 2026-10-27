// dev:worker real|fake: restarts the worktree's worker in the given mode. The
// real worker loads heavy models, so one worktree at a time runs it: its
// process holds a machine-wide lock, released by the kernel when it dies.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { lock, tryLock } from '../infra/flock.ts'
import type { Infrastructure, SupervisedProcess, SupervisorState } from '../infra/ports.ts'
import { Refusal } from './refusal.ts'
import { readEnv, readState, required, writeState } from './state.ts'
import { type Worktree, worktreeAt } from './worktree.ts'

const MODES = ['real', 'fake']
// How long the restarted real worker gets to take its lock.
const REAL_WORKER_WAIT_MS = 10_000

// The worker as the supervisor runs it: in real mode, under the real worker's
// lock, writing the worktree's identity in it. A busy lock makes it exit.
export function workerProcess(
  env: Record<string, string>,
  lock: string,
  worker: SupervisedProcess,
): SupervisedProcess {
  if (env['POLLY_WORKER_MODE'] !== 'real') {
    return worker
  }
  return {
    ...worker,
    command: 'flock',
    args: [
      '-n',
      lock,
      'sh',
      '-c',
      'printf %s "$POLLY_WORKTREE_ID" > "$0" && exec "$@"',
      lock,
      worker.command,
      ...worker.args,
    ],
  }
}

export function setMode(worktree: Worktree, mode: string): Record<string, string> {
  const content = readFileSync(worktree.envFile, 'utf8')
  writeFileSync(worktree.envFile, content.replace(/^POLLY_WORKER_MODE=.*$/m, `POLLY_WORKER_MODE=${mode}`))
  return readEnv(worktree) ?? {}
}

// The worktree holding the real worker's lock, once a holder has written it;
// undefined while the lock is free.
export async function realWorkerHolder(lockFile: string): Promise<string | undefined> {
  const free = await tryLock(lockFile)
  if (free !== undefined) {
    await free.release()
    return undefined
  }
  return readFileSync(lockFile, 'utf8').trim()
}

// Waits for the restarted real worker to hold its lock. Another worktree may
// take it between the check and the restart: its name is returned then.
async function realWorkerTakenBy(lockFile: string, identity: string): Promise<string | undefined> {
  const deadline = Date.now() + REAL_WORKER_WAIT_MS
  let other: string | undefined
  while (Date.now() < deadline) {
    const holder = await realWorkerHolder(lockFile)
    if (holder === identity) {
      return undefined
    }
    // A holder seen twice is not a stale name the new holder has yet to replace.
    if (holder !== undefined && holder !== '' && holder === other) {
      return holder
    }
    other = holder
    await sleep(100)
  }
  return other || 'another worktree'
}

export async function worker({
  root,
  infra,
  mode,
  out,
}: {
  root: string
  infra: Infrastructure
  mode: string
  out: (line: string) => void
}): Promise<void> {
  if (!MODES.includes(mode)) {
    throw new Refusal('UNKNOWN_WORKER_MODE', `${mode}; the modes are ${MODES.join(', ')}`)
  }
  const worktree = worktreeAt(root)
  const env = readEnv(worktree)
  if (env === undefined) {
    throw new Refusal('WORKTREE_NOT_CONFIGURED', 'this worktree has no .env.local; run nr dev:up')
  }
  const identity = required(env, 'POLLY_WORKTREE_ID')
  // Waits for a dev:up or dev:down running in this worktree.
  const held = await lock(worktree.upLock)
  try {
    const state = readState(worktree)
    if (state.supervisor === undefined || !infra.supervisor.isRunning(state.supervisor)) {
      throw new Refusal('WORKTREE_NOT_RUNNING', "this worktree's Polly is not running; run nr dev:up")
    }
    const busy = (holder: string) =>
      new Refusal(
        'REAL_WORKER_BUSY',
        `the real worker runs for ${holder}; run nr dev:worker fake there first`,
      )
    if (mode === 'real') {
      mkdirSync(dirname(infra.realWorkerLock), { recursive: true })
      const holder = await realWorkerHolder(infra.realWorkerLock)
      if (holder !== undefined && holder !== identity) {
        throw busy(holder || 'another worktree')
      }
    }
    const restart = async (current: SupervisorState, updated: Record<string, string>) => {
      await infra.supervisor.stop(current)
      const supervisor = await infra.supervisor.start({
        root,
        processes: infra.application.processes(updated),
        env: updated,
      })
      writeState(worktree, { ...readState(worktree), supervisor })
      return supervisor
    }
    const supervisor = await restart(state.supervisor, setMode(worktree, mode))
    if (mode === 'real') {
      const other = await realWorkerTakenBy(infra.realWorkerLock, identity)
      if (other !== undefined) {
        await restart(supervisor, setMode(worktree, 'fake'))
        throw busy(other)
      }
    }
    out(`worker: ${mode}`)
  } finally {
    await held.release()
  }
}
