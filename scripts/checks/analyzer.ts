// The architecture analyzer's command: the one built in the worktree when there
// is one, so a change to the analyzer is checked by itself; the pinned package
// otherwise. Every caller runs it through runWith, which says what is missing
// when there is none to run.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// The command and its arguments.
export function analyzerCommand(
  root: string,
  args: string[],
  exists: (path: string) => boolean = existsSync,
): string[] {
  const local = join(root, 'tools/architecture/analyzer/target/release/architecture-analyzer')
  return exists(local)
    ? [local, ...args]
    : [process.execPath, join(root, 'node_modules/@hvn-p/architecture/bin/architecture.js'), ...args]
}

export interface Spawned {
  status: number | null
  error?: Error
}

export interface AnalyzerIo<T extends Spawned> {
  exists: (path: string) => boolean
  spawn: (command: string, args: string[]) => T
}

const MISSING =
  'ARCHITECTURE_ANALYZER_MISSING: no analyzer built in tools/architecture/analyzer, nor installed as @hvn-p/architecture; run pnpm install, or cargo build --release in tools/architecture/analyzer'

// Runs the analyzer: its run, or the line saying why it did not run.
export function runWith<T extends Spawned>(
  root: string,
  args: string[],
  { exists, spawn }: AnalyzerIo<T>,
): { ran: T } | { failure: string } {
  const [command = '', ...rest] = analyzerCommand(root, args, exists)
  const program = command === process.execPath ? (rest[0] ?? '') : command
  if (!exists(program)) {
    return { failure: MISSING }
  }
  const ran = spawn(command, rest)
  if (ran.error !== undefined) {
    return { failure: `the architecture analyzer did not start: ${program}: ${ran.error.message}` }
  }
  return { ran }
}

// A module as the analyzer places it: its tier and its files, from the root.
export interface Module {
  id: string
  tier: string
  files: string[]
}

export function readModules(root: string): Module[] {
  const run = runWith(root, ['json'], {
    exists: existsSync,
    spawn: (command, args) =>
      spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
  })
  if ('failure' in run) {
    throw new Error(run.failure)
  }
  if (run.ran.status !== 0) {
    throw new Error(`the architecture analyzer failed: ${run.ran.stderr}`)
  }
  return (JSON.parse(run.ran.stdout) as { modules: Module[] }).modules
}
