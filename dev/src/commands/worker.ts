// dev:worker real|fake: restarts the worktree's worker in the given mode. The
// real worker loads heavy models, so one worktree at a time runs it: its
// process holds a machine-wide lock, released by the kernel when it dies.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { tryLock } from '../infra/flock.ts'
import type { Infrastructure, SupervisedProcess } from '../infra/ports.ts'
import { Refusal } from './refusal.ts'
import { readEnv, readState, required, writeState } from './state.ts'
import { worktreeAt } from './worktree.ts'

const MODES = ['real', 'fake']

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
  if (mode === 'real') {
    mkdirSync(dirname(infra.realWorkerLock), { recursive: true })
    const free = await tryLock(infra.realWorkerLock)
    if (free === undefined) {
      const holder = readFileSync(infra.realWorkerLock, 'utf8').trim()
      if (holder !== identity) {
        throw new Refusal(
          'REAL_WORKER_BUSY',
          `the real worker runs for ${holder || 'another worktree'}; run nr dev:worker fake there first`,
        )
      }
    }
    await free?.release()
  }

  const content = readFileSync(worktree.envFile, 'utf8')
  writeFileSync(worktree.envFile, content.replace(/^POLLY_WORKER_MODE=.*$/m, `POLLY_WORKER_MODE=${mode}`))
  const updated = readEnv(worktree) ?? {}
  const state = readState(worktree)
  if (state.supervisor !== undefined) {
    await infra.supervisor.stop(state.supervisor)
  }
  const supervisor = await infra.supervisor.start({
    root,
    processes: infra.application.processes(updated),
    env: updated,
  })
  writeState(worktree, { ...state, supervisor })
  out(`worker: ${mode}`)
}
