// Exclusive sections held through SQLite's exclusive transaction on a lock
// file: SQLite takes a POSIX lock, which the kernel releases when its holder
// dies, on Linux as on macOS, so a stale lock is reclaimed by construction
// (research R7).

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'

export interface Lock {
  release: () => Promise<void>
}

// How often a waiting lock tries again; waiting never blocks the event loop.
const RETRY_MS = 50

// The lock, or undefined when another holder has it.
export async function tryLock(path: string): Promise<Lock | undefined> {
  mkdirSync(dirname(path), { recursive: true })
  const database = new DatabaseSync(path, { timeout: 0 })
  try {
    database.exec('BEGIN EXCLUSIVE')
  } catch {
    database.close()
    return undefined
  }
  return {
    release: async () => {
      database.exec('ROLLBACK')
      database.close()
    },
  }
}

// The lock, once every other holder has released it.
export async function lock(path: string): Promise<Lock> {
  for (;;) {
    const held = await tryLock(path)
    if (held !== undefined) {
      return held
    }
    await sleep(RETRY_MS)
  }
}
