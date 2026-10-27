// Starts and stops a worktree's supervisor. The supervisor leads its own
// process group, so stopping the group stops every process it started, even
// after the supervisor itself was killed.

import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Supervisor } from '../infra/ports.ts'
import { SUPERVISOR_MARK } from './mark.ts'

const supervisorMain = join(import.meta.dirname, 'main.ts')

// The state and process group of a live (not zombie) process, read from /proc.
function liveProcess(pid: string): { group: number } | undefined {
  try {
    const [state, , group] = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.split(' ') ?? []
    return state === 'Z' ? undefined : { group: Number(group) }
  } catch {
    return undefined
  }
}

// The live processes of a process group.
export function groupMembers(pgid: number): number[] {
  return readdirSync('/proc')
    .filter((entry) => /^\d+$/.test(entry) && liveProcess(entry)?.group === pgid)
    .map(Number)
}

function groupAlive(pgid: number): boolean {
  return groupMembers(pgid).length > 0
}

function runsSupervisor(pid: number): boolean {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes(supervisorMain)
  } catch {
    return false
  }
}

function carriesMark(pid: number, leader: number): boolean {
  try {
    return readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').includes(`${SUPERVISOR_MARK}=${leader}`)
  } catch {
    return false
  }
}

// Whether the process group led by pid is still the supervisor's. Linux does
// not reuse a PID while a group of that number has members, so when the
// supervisor is gone, its group is the one whose members carry its mark.
function supervisorGroup(pid: number): boolean {
  if (runsSupervisor(pid)) {
    return true
  }
  if (liveProcess(String(pid)) !== undefined) {
    return false
  }
  return groupMembers(pid).some((member) => carriesMark(member, pid))
}

// graceMs: how long the processes get to stop on SIGTERM before SIGKILL.
export function processSupervisor({ graceMs = 10_000 }: { graceMs?: number } = {}): Supervisor {
  return {
    // A PID can be reused: it is the supervisor only if it runs supervisor/main.ts.
    isRunning: ({ pid }) => runsSupervisor(pid),
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
      // A reused PID may lead a foreign group, which is never signalled.
      if (!supervisorGroup(pid)) {
        return
      }
      process.kill(-pid, 'SIGTERM')
      const deadline = Date.now() + graceMs
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
