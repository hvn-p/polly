// dev:down: stops the worktree's processes and gives back everything it
// holds, as recorded by dev:up, whatever the branch is called by then. What is
// already gone is skipped, so it can run again.

import { readFileSync, writeFileSync } from 'node:fs'
import { lock } from '../machine/index.ts'
import type { Infrastructure } from '../ports/index.ts'
import { deleteState, readEnv, readState, resourcesOf, type Worktree, worktreeAt } from '../worktree/index.ts'

export interface DownOptions {
  root: string
  infra: Infrastructure
  out: (line: string) => void
}

// Garage never lets a deleted key id exist again: the next dev:up generates a
// new key instead of reusing this one. The worker goes back to fake mode, so
// the next dev:up starts no compute service.
function resetConfiguration(worktree: Worktree): void {
  const kept = readFileSync(worktree.envFile, 'utf8')
    .split('\n')
    .filter((line) => !/^S3_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=/.test(line))
    .map((line) => line.replace(/^POLLY_WORKER_MODE=.*$/, 'POLLY_WORKER_MODE=fake'))
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
    if (state.compute !== undefined) {
      await infra.compute.release(state.compute, resources.identity)
    }
    await infra.postgres.release(resources.database.names)
    await infra.garage.release(resources.bucket)
    resetConfiguration(worktree)
    await infra.routes.remove(state.route ?? resources.route)
    deleteState(worktree)
    out(`released ${resources.host}`)
  } finally {
    await held.release()
  }
}
