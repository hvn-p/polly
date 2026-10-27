// Exclusive sections held with the `flock` command: the kernel releases the
// lock when its holder dies, so a stale lock is reclaimed by construction.

import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Lock {
  release: () => Promise<void>
}

// Holds the lock in a `flock` child whose command waits on its stdin: closing
// stdin, or this process dying, releases it.
function hold(path: string, wait: boolean): Promise<Lock | undefined> {
  mkdirSync(dirname(path), { recursive: true })
  const child = spawn('flock', [...(wait ? [] : ['-n']), path, 'sh', '-c', 'echo locked; exec cat'], {
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.stdout.once('data', () => {
      resolve({
        release: async () => {
          child.stdin.end()
          await exited
        },
      })
    })
    void exited.then(() => resolve(undefined))
  })
}

// The lock, or undefined when another process holds it.
export function tryLock(path: string): Promise<Lock | undefined> {
  return hold(path, false)
}

// The lock, once every other holder has released it.
export async function lock(path: string): Promise<Lock> {
  const held = await hold(path, true)
  if (held === undefined) {
    throw new Error(`flock could not wait on ${path}`)
  }
  return held
}
