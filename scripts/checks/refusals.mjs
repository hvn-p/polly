#!/usr/bin/env node
// Checks that each process builds its answers in one place, with the statuses
// of the API's contract (constitution principle VIII): anywhere in apps/ and
// packages/, a response, an HTTP status or an event-stream frame is built by a
// translation point only. The API's routes and access rules throw a Refusal,
// which its refusals.ts turns into an answer; the MCP server's refusals are
// built by its refusals.ts alone, and its tools are registered through
// tools.ts, which applies that translation.
//
// Usage: node scripts/checks/refusals.mjs [repository root]

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { report } from './report.mjs'

const SOURCE_FILE = /\.(ts|tsx|mts|js|mjs)$/
const TEST_FILE = /\.test\.(ts|tsx|mts|js|mjs)$/
// Dependencies, builds and test support: none of them is a process's code.
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'test'])
const SCOPE = ['apps', 'packages']

// The one file per process that builds an answer.
export const TRANSLATIONS = ['apps/api/src/refusals.ts', 'apps/mcp/src/refusals.ts']

// Where the statuses are defined: the API's contract and its generated copies.
const DEFINITIONS = [/^apps\/api\/src\/contracts\//, /^packages\/[^/]+\/src\/generated\.ts$/]

/** @type {Record<string, string>} each file allowed to build a response, with its reason */
export const ALLOWED = {
  'packages/identity/src/index.ts':
    'requireMcpAuth (@better-auth/mcp) only verifies a token through a callback that returns a Response, which it consumes itself: no client receives it, and the package exposes no other verification',
}

/**
 * @typedef {object} Layout
 * @property {string} translations the one file that builds tool errors
 * @property {string} toolRegistration the one file that registers MCP tools
 */

/** @type {Record<string, Layout>} */
export const PROCESSES = {
  'apps/api/src': { translations: 'refusals.ts', toolRegistration: 'refusals.ts' },
  'apps/mcp/src': { translations: 'refusals.ts', toolRegistration: 'tools.ts' },
}

const TRANSLATED = `throw a Refusal (@polly/platform), or return what ${TRANSLATIONS.join(' or ')} builds`

const ANSWER_RULES = [
  {
    pattern: /\bstatus:\s*\d{3}\b/,
    definesIt: true,
    fix: `a status is the contract's, written by the translation point alone: ${TRANSLATED}`,
  },
  {
    pattern: /\bnew Response\(|\bResponse\.(json|redirect|error)\(/,
    fix: `an answer is not built here: ${TRANSLATED}`,
  },
  {
    pattern: /['"`]event: /,
    fix: `an event-stream frame is not built here: ${TRANSLATED}`,
  },
]

/** @param {Layout} layout */
function toolRules({ translations, toolRegistration }) {
  return [
    {
      pattern: /\bisError\b/,
      allowedIn: translations,
      fix: `a tool does not build its own error: throw a Refusal (@polly/platform), or build it in ${translations}`,
    },
    {
      pattern: /\.registerTool\(/,
      allowedIn: toolRegistration,
      fix: `register the tool with defineTool from ${toolRegistration}, which translates its refusals`,
    },
  ]
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
 * The rules a file answers to, by its path from the root.
 * @param {string} path
 */
function rulesOf(path) {
  const defines = DEFINITIONS.some((definition) => definition.test(path))
  const rules =
    TRANSLATIONS.includes(path) || Object.hasOwn(ALLOWED, path)
      ? []
      : ANSWER_RULES.filter((rule) => !(defines && rule.definesIt)).map(({ pattern, fix }) => ({
          pattern,
          fix,
        }))
  for (const [dir, layout] of Object.entries(PROCESSES)) {
    if (path.startsWith(`${dir}/`)) {
      const inProcess = path.slice(dir.length + 1)
      rules.push(...toolRules(layout).filter((rule) => rule.allowedIn !== inProcess))
    }
  }
  return rules
}

/**
 * @param {string} root
 * @returns {string[]} one line per violation, its path from the root, each naming its fix
 */
export function checkRepository(root) {
  /** @type {string[]} */
  const violations = []
  for (const file of SCOPE.flatMap((dir) => listSources(join(root, dir)))) {
    const path = relative(root, file).split(sep).join('/')
    const rules = rulesOf(path)
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const rule of rules) {
          if (rule.pattern.test(line)) {
            violations.push(`${path}:${index + 1}: ${rule.fix}`)
          }
        }
      })
  }
  return violations
}

/**
 * The command line: `node scripts/checks/refusals.mjs [root]`.
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
