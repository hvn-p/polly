// The supervisor of one worktree: a detached process-group leader that runs
// the worktree's processes, writes each one's output to .dev/logs/<name>.log,
// restarts a process that exits, and stops them all on SIGTERM.
//
// Started by the supervisor adapter from its build: node dev/dist/supervisor.js
// <spec.json>

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupervisedProcess } from '../ports/index.ts'
import { SUPERVISOR_MARK } from './mark.ts'

interface Spec {
  root: string
  processes: SupervisedProcess[]
}

const RESTART_DELAY_MS = 2000

const spec = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as Spec
const logs = join(spec.root, '.dev', 'logs')
mkdirSync(logs, { recursive: true })

const children = new Map<string, ChildProcess>()
let stopping = false

function launch(definition: SupervisedProcess): void {
  // A restart due after the stop began is dropped.
  if (stopping) {
    return
  }
  const log = openSync(join(logs, `${definition.name}.log`), 'a')
  const child = spawn(definition.command, definition.args, {
    cwd: definition.cwd,
    env: { ...process.env, [SUPERVISOR_MARK]: String(process.pid) },
    stdio: ['ignore', log, log],
  })
  children.set(definition.name, child)
  child.once('exit', () => {
    children.delete(definition.name)
    if (!stopping) {
      setTimeout(() => launch(definition), RESTART_DELAY_MS)
    }
  })
}

function stop(): void {
  stopping = true
  for (const child of children.values()) {
    child.kill('SIGTERM')
  }
  const exit = () => {
    if (children.size === 0) {
      process.exit(0)
    }
  }
  for (const child of children.values()) {
    child.once('exit', exit)
  }
  exit()
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
for (const definition of spec.processes) {
  launch(definition)
}
