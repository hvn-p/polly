// dev:down: stops the worktree's processes and gives back everything it
// holds, as recorded by dev:up, whatever the branch is called by then. What is
// already gone is skipped, so it can run again.

import { readFileSync, writeFileSync } from 'node:fs'
import { lock } from '../infra/flock.ts'
import type { Infrastructure } from '../infra/ports.ts'
import { deleteState, readEnv, readState, resourcesOf } from './state.ts'
import { type Worktree, worktreeAt } from './worktree.ts'

export interface DownOptions {
  root: string
  infra: Infrastructure
  out: (line: string) => void
}

// Garage never lets a deleted key id exist again: the next dev:up generates a
// new key instead of reusing this one.
function forgetBucketKey(worktree: Worktree): void {
  const kept = readFileSync(worktree.envFile, 'utf8')
    .split('\n')
    .filter((line) => !/^S3_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=/.test(line))
  writeFileSync(worktree.envFile, kept.join('\n'))
}

export async function down({ root, infra, out }: DownOptions): Promise<void> {
  const worktree = worktreeAt(root)
  // Waits for a dev:up running in this worktree, then keeps it from starting.
  const held = await lock(worktree.upLock)
  try {
    const env = readEnv(worktree)
    const state = readState(worktree)
    // A dev:up that failed midway leaves no state but may have created
    // resources: as long as the configuration names them, they are released.
    if (env === undefined) {
      out('nothing to release')
      return
    }
    await infra.shared.ensureRunning()
    if (state.supervisor !== undefined) {
      await infra.supervisor.stop(state.supervisor)
    }
    const resources = resourcesOf(env)
    await infra.postgres.release(resources.database.names)
    await infra.garage.release(resources.bucket)
    forgetBucketKey(worktree)
    await infra.routes.remove(state.route ?? resources.route)
    deleteState(worktree)
    out(`released ${resources.host}`)
  } finally {
    await held.release()
  }
}
