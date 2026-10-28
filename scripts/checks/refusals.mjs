#!/usr/bin/env node
// Checks that each process builds its refusals in one place (constitution
// principle VIII): the API's routes and access rules throw a Refusal, which
// entry/refusals.ts alone turns into an HTTP response; the MCP server's
// refusals (an API refusal, an unauthorized request) are built by its
// refusals.ts alone, and its tools are registered through tools.ts, which
// applies that translation.
//
// Usage: node scripts/checks/refusals.mjs [repository root]

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { report } from './report.mjs'

const SOURCE_FILE = /\.(ts|tsx|mts|js|mjs)$/
const TEST_FILE = /\.test\.(ts|tsx|mts|js|mjs)$/

/**
 * @typedef {object} Layout
 * @property {string} translations the one file that builds refusal responses and tool errors
 * @property {string} toolRegistration the one file that registers MCP tools
 */

/** @type {Layout} */
export const API_LAYOUT = { translations: 'entry/refusals.ts', toolRegistration: 'entry/refusals.ts' }

/** @type {Record<string, Layout>} */
export const PROCESSES = {
  'apps/api/src': API_LAYOUT,
  'apps/mcp/src': { translations: 'refusals.ts', toolRegistration: 'tools.ts' },
}

/** @param {Layout} layout */
function rules({ translations, toolRegistration }) {
  const thrown = `throw a Refusal (@polly/platform), or build the answer in ${translations}`
  return [
    {
      pattern: /\bstatus:\s*[45]\d\d\b/,
      allowedIn: translations,
      fix: `a refusal is not built as a response here: ${thrown}`,
    },
    {
      pattern: /\bisError\b/,
      allowedIn: translations,
      fix: `a tool does not build its own error: ${thrown}`,
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
 * @param {string} src a process's source directory
 * @param {Layout} [layout]
 * @returns {string[]} one line per violation, each naming its fix
 */
export function checkRefusals(src, layout = API_LAYOUT) {
  /** @type {string[]} */
  const violations = []
  if (!existsSync(src)) {
    return violations
  }
  for (const file of listSources(src)) {
    const path = relative(src, file).split(sep).join('/')
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        for (const rule of rules(layout)) {
          if (path !== rule.allowedIn && rule.pattern.test(line)) {
            violations.push(`${path}:${index + 1}: ${rule.fix}`)
          }
        }
      })
  }
  return violations
}

/**
 * @param {string} root
 * @returns {string[]} every process's violations, their paths from the root
 */
export function checkRepository(root) {
  return Object.entries(PROCESSES).flatMap(([dir, layout]) =>
    checkRefusals(join(root, dir), layout).map((line) => `${dir}/${line}`),
  )
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
