#!/usr/bin/env node
// Runs the architecture analyzer on the repository with the given arguments:
// the one built in the worktree when there is one, as dev:up's view does, so a
// change to the analyzer is checked by itself; the pinned package otherwise.
//
// Usage: node scripts/checks/architecture.mjs check

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * @param {string} root
 * @param {string[]} args
 * @param {(path: string) => boolean} exists
 * @returns {string[]} the command and its arguments
 */
export function analyzerCommand(root, args, exists = existsSync) {
  const local = join(root, 'tools/architecture/analyzer/target/release/architecture-analyzer')
  return exists(local)
    ? [local, ...args]
    : [process.execPath, join(root, 'node_modules/@hvn-p/architecture/bin/architecture.js'), ...args]
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(import.meta.dirname, '..', '..')
  const [command = '', ...args] = analyzerCommand(root, process.argv.slice(2))
  process.exitCode = spawnSync(command, args, { stdio: 'inherit', cwd: root }).status ?? 1
}
