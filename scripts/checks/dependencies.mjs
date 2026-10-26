#!/usr/bin/env node
// Checks the dependency graph of the API (constitution principle VII): tiers
// entry > flows > domains > reference > kernel, imports point down only, no
// import between two flows or two domains, a module is entered through its
// index.ts only, no cycle between modules. Migrations import nothing of the
// application, and only entry imports them.
//
// Usage: node scripts/checks/dependencies.mjs [apps/api/src]

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TIERS = ['entry', 'flows', 'domains', 'reference', 'kernel']
const MIGRATIONS = 'migrations'
/** @type {Record<string, string>} */
const PEER_FIXES = {
  flows: 'two flows never import each other: compose them in entry',
  domains:
    'two domains never import each other: declare a port in the importing domain and feed it from a flow',
}
const SOURCE_FILE = /\.(ts|tsx|mts|js|mjs)$/
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

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
    } else if (SOURCE_FILE.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

/**
 * The location of a file inside src: its tier, its module (the first path
 * segment under the tier; entry is one module) and whether it is the
 * module's entry point.
 * @param {string} path relative to src, with forward slashes
 */
function locate(path) {
  const [tier = '', first = '', ...rest] = path.split('/')
  if (tier === 'entry' || tier === MIGRATIONS) {
    return { tier, module: tier, isEntryPoint: true }
  }
  const isFile = rest.length === 0
  return {
    tier,
    module: `${tier}/${isFile ? first.replace(SOURCE_FILE, '') : first}`,
    isEntryPoint: isFile || (rest.length === 1 && rest[0] === 'index.ts'),
  }
}

/**
 * @param {Map<string, Set<string>>} graph module -> modules it imports
 * @returns {string[][]} each cycle found, as the list of its modules
 */
function findCycles(graph) {
  /** @type {string[][]} */
  const cycles = []
  /** @type {Map<string, 'open' | 'done'>} */
  const state = new Map()
  /** @type {string[]} */
  const stack = []
  /** @param {string} node */
  const visit = (node) => {
    state.set(node, 'open')
    stack.push(node)
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 'open') {
        cycles.push([...stack.slice(stack.indexOf(next)), next])
      } else if (!state.has(next)) {
        visit(next)
      }
    }
    stack.pop()
    state.set(node, 'done')
  }
  for (const node of [...graph.keys()].sort()) {
    if (!state.has(node)) {
      visit(node)
    }
  }
  return cycles
}

/**
 * @param {string} src the API's source directory
 * @returns {string[]} one line per violation, each naming its fix
 */
export function checkDependencies(src) {
  /** @type {string[]} */
  const violations = []
  if (!existsSync(src)) {
    return violations
  }
  for (const entry of readdirSync(src)) {
    if (!TIERS.includes(entry) && entry !== MIGRATIONS) {
      violations.push(`${entry}: not a tier; place it under one of ${TIERS.join(', ')}`)
    }
  }

  /** @type {Map<string, Set<string>>} */
  const graph = new Map()
  for (const file of listSources(src)) {
    const from = relative(src, file).split(sep).join('/')
    const source = locate(from)
    if (!TIERS.includes(source.tier) && source.tier !== MIGRATIONS) {
      continue
    }
    for (const [, specifier = ''] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (!specifier.startsWith('.')) {
        continue
      }
      let target = resolve(dirname(file), specifier)
      if (existsSync(target) && statSync(target).isDirectory()) {
        target = join(target, 'index.ts')
      }
      const to = relative(src, target).split(sep).join('/')
      if (to.startsWith('..')) {
        continue
      }
      const destination = locate(to)
      if (destination.module === source.module) {
        continue
      }
      const prefix = `${from} imports ${to}`
      if (source.tier === MIGRATIONS) {
        violations.push(`${prefix}: migrations import nothing of the application; inline what they need`)
        continue
      }
      if (destination.tier === MIGRATIONS) {
        if (source.tier !== 'entry') {
          violations.push(`${prefix}: only entry runs migrations`)
        }
        continue
      }
      const sourceRank = TIERS.indexOf(source.tier)
      const destinationRank = TIERS.indexOf(destination.tier)
      if (destinationRank < sourceRank) {
        violations.push(
          `${prefix}: dependencies point down (${TIERS.join(' > ')}); ` +
            'move the shared part down, or compose both in the tier above',
        )
        continue
      }
      const peerFix = PEER_FIXES[source.tier]
      if (destinationRank === sourceRank && peerFix !== undefined) {
        violations.push(`${prefix}: ${peerFix}`)
        continue
      }
      if (!destination.isEntryPoint) {
        violations.push(`${prefix}: import the module through its index file: ${destination.module}/index.ts`)
        continue
      }
      const edges = graph.get(source.module) ?? new Set()
      edges.add(destination.module)
      graph.set(source.module, edges)
    }
  }
  for (const cycle of findCycles(graph)) {
    violations.push(`cycle: ${cycle.join(' -> ')}; break it by moving the shared part to a lower tier`)
  }
  return violations
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkDependencies(resolve(process.argv[2] ?? 'apps/api/src'))
  for (const violation of violations) {
    console.error(violation)
  }
  if (violations.length > 0) {
    process.exit(1)
  }
}
