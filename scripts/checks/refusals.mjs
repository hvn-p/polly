#!/usr/bin/env node
// Checks that the API builds its refusals in one place (constitution principle
// VIII): a route, an access rule or an MCP tool throws a Refusal, and
// entry/refusals.ts alone turns it into an HTTP response or a tool error. A
// tool is registered through defineTool, which applies that translation.
//
// Usage: node scripts/checks/refusals.mjs [apps/api/src]

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { report } from './report.mjs'

const TRANSLATIONS = 'entry/refusals.ts'
const TOOL_REGISTRATION = 'entry/mcp/index.ts'
const SOURCE_FILE = /\.(ts|tsx|mts|js|mjs)$/
const TEST_FILE = /\.test\.(ts|tsx|mts|js|mjs)$/
const THROW = `throw a Refusal (@polly/platform); ${TRANSLATIONS} translates it`

const RULES = [
  {
    pattern: /\bstatus:\s*[45]\d\d\b/,
    allowedIn: TRANSLATIONS,
    fix: `a refusal is not built as a response here: ${THROW}`,
  },
  { pattern: /\bisError\b/, allowedIn: TRANSLATIONS, fix: `a tool does not build its own error: ${THROW}` },
  {
    pattern: /\.registerTool\(/,
    allowedIn: TOOL_REGISTRATION,
    fix: `register the tool with defineTool from ${TOOL_REGISTRATION}, which translates its refusals`,
  },
]

/**
 * @param {string} directory
 * @param {string[]} found
 * @returns {string[]}
 */
function listSources(directory, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      listSources(path, found)
    } else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

/**
 * @param {string} src the API's source directory
 * @returns {string[]} one line per violation, each naming its fix
 */
export function checkRefusals(src) {
  /** @type {string[]} */
  const violations = []
  for (const file of listSources(src)) {
    const path = relative(src, file).split(sep).join('/')
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const rule of RULES) {
          if (path !== rule.allowedIn && rule.pattern.test(line)) {
            violations.push(`${path}:${index + 1}: ${rule.fix}`)
          }
        }
      })
  }
  return violations
}

/**
 * The command line: `node scripts/checks/refusals.mjs [src]`.
 * @param {string[]} argv
 * @param {(line: string) => void} write
 * @returns {number}
 */
export function run(argv, write) {
  return report(checkRefusals(resolve(argv[0] ?? 'apps/api/src')), write)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.error(line))
}
