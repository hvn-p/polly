#!/usr/bin/env node
// Runs the architecture analyzer on the repository with the given arguments,
// as dev:up's view does (analyzer.ts says which one), and says what is missing
// when there is none to run.
//
// Usage: node scripts/checks/architecture.mjs check

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzerCommand } from './analyzer.ts'

export { analyzerCommand }

/**
 * @typedef {object} Io
 * @property {(path: string) => boolean} exists
 * @property {(command: string, args: string[]) => { status: number | null, error?: Error }} spawn
 * @property {(line: string) => void} write
 */

/**
 * @param {string} root
 * @param {string[]} args
 * @param {Io} io
 * @returns {number} the analyzer's exit status, or 1 when it did not run
 */
export function runAnalyzer(root, args, { exists, spawn, write }) {
  const [command = '', ...rest] = analyzerCommand(root, args, exists)
  const program = command === process.execPath ? (rest[0] ?? '') : command
  if (!exists(program)) {
    write(
      'ARCHITECTURE_ANALYZER_MISSING: no analyzer built in tools/architecture/analyzer, nor installed as @hvn-p/architecture; run pnpm install, or cargo build --release in tools/architecture/analyzer',
    )
    return 1
  }
  const result = spawn(command, rest)
  if (result.error !== undefined) {
    write(`the architecture analyzer did not start: ${program}: ${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(import.meta.dirname, '..', '..')
  process.exitCode = runAnalyzer(root, process.argv.slice(2), {
    exists: existsSync,
    spawn: (command, args) => spawnSync(command, args, { stdio: 'inherit', cwd: root }),
    write: (line) => console.error(line),
  })
}
