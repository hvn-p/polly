#!/usr/bin/env node
// Checks the back's log events (constitution XIX): each is declared once, with
// defineEvent, in an events.ts of the module that emits it, that module emits
// it, and its tier logs its category. A name declared twice, a declaration
// elsewhere, an event no file beside its events.ts names, or a category its
// tier does not log (as the architecture analyzer places the module), is
// refused.
//
// Usage: node scripts/checks/log-events.mjs [repository root]

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readModules } from './analyzer.ts'
import { report } from './report.mjs'

const SOURCE_FILE = /\.(ts|tsx|mts|js|mjs)$/
const TEST_FILE = /\.test\.(ts|tsx|mts|js|mjs)$/
// Dependencies, builds and test support: none of them is a process's code.
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'test'])
const SCOPE = ['apps', 'packages']
// A declaration, over as many lines as it takes: its constant, name and category.
const DECLARATION =
  /(?:export\s+const\s+(\w+)\s*=\s*)?\bdefineEvent\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*\{[^}]*?\bcategory:\s*['"`](\w+)['"`])?/g
// The categories each tier logs, and where each category is logged from.
/** @type {Record<string, string[]>} */
const LOGGED = { interfaces: ['access', 'security'], flows: ['functional'], adapters: ['technical'] }
/** @type {Record<string, string>} */
const LOGGED_FROM = {
  access: 'a route or workflow',
  security: 'a route or workflow',
  functional: 'a flow',
  technical: 'an adapter',
}

/**
 * Why a tier may not log an event of that category, with its fix; nothing when it may.
 * @param {string | undefined} tier
 * @param {string} category
 * @returns {string | undefined}
 */
function tierRefusal(tier, category) {
  if (tier === undefined) {
    return 'is declared in no module the analyzer places in a tier: move it into a tier that logs'
  }
  const logged = LOGGED[tier] ?? []
  if (logged.includes(category)) {
    return undefined
  }
  const article = /^[aeiou]/.test(category) ? 'an' : 'a'
  const fix =
    logged.length === 0
      ? 'return the decision as a value or a refusal, and log it from a flow'
      : `log ${logged.join(' and ')} events there, ${category} events from ${LOGGED_FROM[category] ?? 'the tier that logs them'}`
  return `is ${article} ${category} event, which the ${tier} tier does not log: ${fix}`
}

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
 * @param {import('./analyzer.ts').Module[]} modules the analyzer's modules, each with its tier
 * @returns {string[]} one line per violation, its path from the root, each naming its fix
 */
export function checkRepository(root, modules) {
  const files = SCOPE.flatMap((dir) => listSources(join(root, dir)))
    .map((file) => ({ path: relative(root, file).split(sep).join('/'), text: readFileSync(file, 'utf8') }))
    .sort((a, b) => (a.path < b.path ? -1 : 1))
  /** @type {string[]} */
  const violations = []
  /** @type {Map<string, string>} each event name, with the file declaring it */
  const declaredIn = new Map()
  for (const { path, text } of files) {
    for (const match of text.matchAll(DECLARATION)) {
      const [, constant, name = '', category = ''] = match
      const at = `${path}:${text.slice(0, match.index).split('\n').length}`
      if (basename(path) !== 'events.ts') {
        violations.push(
          `${at}: ${name} is declared outside an events.ts: declare it in its module's events.ts`,
        )
        continue
      }
      const first = declaredIn.get(name)
      if (first !== undefined) {
        violations.push(`${at}: ${name} is already declared in ${first}: give each event its own name`)
        continue
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
      const tier = modules.find(({ files: inModule }) => inModule.includes(path))?.tier
      const refusal = tierRefusal(tier, category)
      if (refusal !== undefined) {
        violations.push(`${at}: ${name} ${refusal}`)
      }
    }
  }
  return violations
}

/**
 * The command line: `node scripts/checks/log-events.mjs [root]`.
 * @param {string[]} argv
 * @param {(line: string) => void} write
 * @param {(root: string) => import('./analyzer.ts').Module[]} read
 * @returns {number}
 */
export function run(argv, write, read = readModules) {
  const root = resolve(argv[0] ?? '.')
  return report(checkRepository(root, read(root)), write)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.error(line))
}
