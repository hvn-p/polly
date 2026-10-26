// Starts and stops a worktree's supervisor. The supervisor leads its own
// process group, so stopping the group stops every process it started, even
// after the supervisor itself was killed.

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Supervisor } from '../infra/ports.ts'

const supervisorMain = join(import.meta.dirname, 'main.ts')
const STOP_GRACE_MS = 10_000

// The live (not zombie) processes of a process group, read from /proc.
export function groupMembers(pgid: number): number[] {
  return readdirSync('/proc')
    .filter((entry) => /^\d+$/.test(entry))
    .filter((pid) => {
      try {
        const [state, , group] = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.split(' ') ?? []
        return state !== 'Z' && Number(group) === pgid
      } catch {
        return false
      }
    })
    .map(Number)
}

function groupAlive(pgid: number): boolean {
  return groupMembers(pgid).length > 0
}

export function processSupervisor(): Supervisor {
  return {
    // A PID can be reused: it is the supervisor only if it runs supervisor/main.ts.
    isRunning: ({ pid }) => {
      try {
        return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes(supervisorMain)
      } catch {
        return false
      }
    },
    start: async ({ root, processes, env }) => {
      const directory = join(root, '.dev')
      mkdirSync(directory, { recursive: true })
      const specFile = join(directory, 'supervisor.json')
      writeFileSync(specFile, JSON.stringify({ root, processes }, null, 2))
      const child = spawn(process.execPath, [supervisorMain, specFile], {
        cwd: root,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, ...env },
      })
      child.unref()
      if (child.pid === undefined) {
        throw new Error('the supervisor did not start')
      }
      return { pid: child.pid }
    },
    stop: async ({ pid }) => {
      if (!groupAlive(pid)) {
        return
      }
      process.kill(-pid, 'SIGTERM')
      const deadline = Date.now() + STOP_GRACE_MS
      while (groupAlive(pid) && Date.now() < deadline) {
        await sleep(100)
      }
      if (groupAlive(pid)) {
        process.kill(-pid, 'SIGKILL')
        while (groupAlive(pid)) {
          await sleep(50)
        }
      }
    },
  }
}
