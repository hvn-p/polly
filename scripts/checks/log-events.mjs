#!/usr/bin/env node
// Checks the back's log events (constitution XIX): each is declared once, with
// defineEvent, in an events.ts of the module that emits it, and that module
// emits it. A name declared twice, a declaration elsewhere, or an event no file
// beside its events.ts names, is refused.
//
// Usage: node scripts/checks/log-events.mjs [repository root]

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { report } from './report.mjs'

const SOURCE_FILE = /\.(ts|tsx|mts|js|mjs)$/
const TEST_FILE = /\.test\.(ts|tsx|mts|js|mjs)$/
// Dependencies, builds and test support: none of them is a process's code.
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'test'])
const SCOPE = ['apps', 'packages']
const DECLARATION = /(?:export\s+const\s+(\w+)\s*=\s*)?\bdefineEvent\(\s*['"`]([^'"`]+)['"`]/

/**
 * @param {string} directory
 * @param {string[]} found
 * @returns {string[]}
 */
function listSources(directory, found = []) {
  if (!existsSync(directory)) {
    return found
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
        listSources(path, found)
      }
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

/**
 * @param {string} root
 * @returns {string[]} one line per violation, its path from the root, each naming its fix
 */
export function checkRepository(root) {
  const files = SCOPE.flatMap((dir) => listSources(join(root, dir))).map((file) => ({
    path: relative(root, file).split(sep).join('/'),
    text: readFileSync(file, 'utf8'),
  }))
  /** @type {string[]} */
  const violations = []
  /** @type {Map<string, string>} each event name, with the file declaring it */
  const declaredIn = new Map()
  for (const { path, text } of files) {
    text.split('\n').forEach((line, index) => {
      const match = DECLARATION.exec(line)
      if (match === null) {
        return
      }
      const [, constant, name = ''] = match
      const at = `${path}:${index + 1}`
      if (basename(path) !== 'events.ts') {
        violations.push(
          `${at}: ${name} is declared outside an events.ts: declare it in its module's events.ts`,
        )
        return
      }
      const first = declaredIn.get(name)
      if (first !== undefined) {
        violations.push(`${at}: ${name} is already declared in ${first}: give each event its own name`)
        return
      }
      declaredIn.set(name, path)
      const module = dirname(path)
      // A declaration bound to no constant is emitted nowhere.
      const used = constant === undefined ? /(?!)/ : new RegExp(`\\b${constant}\\b`)
      const emitted = files.some(
        (other) => other.path !== path && other.path.startsWith(`${module}/`) && used.test(other.text),
      )
      if (!emitted) {
        violations.push(`${at}: ${name} is never emitted in ${module}: emit it, or remove its declaration`)
      }
    })
  }
  return violations
}

/**
 * The command line: `node scripts/checks/log-events.mjs [root]`.
 * @param {string[]} argv
 * @param {(line: string) => void} write
 * @returns {number}
 */
export function run(argv, write) {
  return report(checkRepository(resolve(argv[0] ?? '.')), write)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.error(line))
}
