#!/usr/bin/env node
// Runs the architecture analyzer on the repository with the given arguments,
// as dev:up's view does (analyzer.ts says which one).
//
// Usage: node scripts/checks/architecture.mjs check

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzerCommand } from './analyzer.ts'

export { analyzerCommand }

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = join(import.meta.dirname, '..', '..')
  const [command = '', ...args] = analyzerCommand(root, process.argv.slice(2))
  process.exitCode = spawnSync(command, args, { stdio: 'inherit', cwd: root }).status ?? 1
}
