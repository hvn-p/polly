#!/usr/bin/env node
// Checks the dependency graph (constitution principle VII). Inside the API:
// tiers entry > flows > domains > reference > kernel, imports point down only,
// no import between two flows or two domains, a module is entered through its
// index.ts only, no cycle between modules; the migrations live in
// packages/database, never in the API. Between workspace packages: a package
// is entered through its package.json exports only, never one of its files.
//
// Usage: node scripts/checks/dependencies.mjs [repository root]

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { report } from './report.mjs'

const TIERS = ['entry', 'flows', 'domains', 'reference', 'kernel']
/** @type {Record<string, string>} */
const PEER_FIXES = {
  flows: 'two flows never import each other: compose them in entry',
  domains:
    'two domains never import each other: declare a port in the importing domain and feed it from a flow',
}
const SOURCE_FILE = /\.(ts|tsx|mts|js|mjs)$/
// A unit test sits next to its file and is no module of the graph.
const TEST_FILE = /\.test\.(ts|tsx|mts|js|mjs)$/
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

const NOT_SOURCES = new Set(['node_modules', 'dist', 'coverage'])

/**
 * @param {string} directory
 * @param {string[]} found
 * @param {boolean} [withTests]
 * @returns {string[]}
 */
function listSources(directory, found = [], withTests = false) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!NOT_SOURCES.has(entry.name)) {
        listSources(path, found, withTests)
      }
    } else if (SOURCE_FILE.test(entry.name) && (withTests || !TEST_FILE.test(entry.name))) {
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
  if (tier === 'entry') {
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
    if (entry === 'migrations') {
      violations.push(
        `${entry}: the database belongs to Polly, not to the API; move them to packages/database`,
      )
    } else if (!TIERS.includes(entry)) {
      violations.push(`${entry}: not a tier; place it under one of ${TIERS.join(', ')}`)
    }
  }

  /** @type {Map<string, Set<string>>} */
  const graph = new Map()
  for (const file of listSources(src)) {
    const from = relative(src, file).split(sep).join('/')
    const source = locate(from)
    if (!TIERS.includes(source.tier)) {
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

/**
 * The workspace packages: their directory, relative to the root, by name.
 * @param {string} root
 * @returns {Map<string, { directory: string, exports: string[] }>}
 */
function listPackages(root) {
  /** @type {Map<string, { directory: string, exports: string[] }>} */
  const packages = new Map()
  const manifest = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  const list = manifest.split('packages:')[1]?.split(/\n(?=\S)/)[0] ?? ''
  for (const [, pattern = ''] of list.matchAll(/^\s+-\s+['"]?([^'"\s]+)/gm)) {
    const directories = pattern.endsWith('/*')
      ? readdirSync(join(root, pattern.slice(0, -2)), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${pattern.slice(0, -2)}/${entry.name}`)
      : [pattern]
    for (const directory of directories) {
      const path = join(root, directory, 'package.json')
      if (existsSync(path)) {
        const { name, exports } = JSON.parse(readFileSync(path, 'utf8'))
        packages.set(name, { directory, exports: Object.keys(exports ?? {}) })
      }
    }
  }
  return packages
}

/**
 * @param {string} name
 * @param {string[]} exports
 */
function exportFix(name, exports) {
  return exports.length === 0
    ? `add the entry to its package.json exports`
    : `import ${name} through its package.json exports (${exports.map((key) => join(name, key)).join(', ')})`
}

/**
 * Imports between workspace packages, tests included: by the package name,
 * through an entry of its exports, never by a path into its files.
 * @param {string} root the repository root
 * @returns {string[]} one line per violation, each naming its fix
 */
export function checkPackageImports(root) {
  /** @type {string[]} */
  const violations = []
  const packages = listPackages(root)
  const owner = (/** @type {string} */ path) =>
    [...packages.entries()].find(([, { directory }]) => path.startsWith(`${directory}/`))
  for (const [, { directory }] of packages) {
    const files = listSources(join(root, directory), [], true)
    for (const file of files) {
      const from = relative(root, file).split(sep).join('/')
      for (const [, specifier = ''] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        if (specifier.startsWith('.')) {
          const to = relative(root, resolve(dirname(file), specifier))
            .split(sep)
            .join('/')
          const target = owner(to)
          if (target !== undefined && target[1].directory !== directory) {
            violations.push(`${from} imports ${to}: ${exportFix(target[0], target[1].exports)}`)
          }
          continue
        }
        const name = specifier.split('/').slice(0, 2).join('/')
        const target = packages.get(name)
        if (target === undefined) {
          continue
        }
        const subpath = `.${specifier.slice(name.length)}`
        if (target.exports.length === 0) {
          violations.push(`${from} imports ${specifier}: ${exportFix(name, [])}`)
        } else if (!target.exports.includes(subpath)) {
          violations.push(
            `${from} imports ${specifier}: not in its package.json exports; ${exportFix(name, target.exports)}`,
          )
        }
      }
    }
  }
  return violations
}

/**
 * The command line: `node scripts/checks/dependencies.mjs [root]`.
 * @param {string[]} argv
 * @param {(line: string) => void} write
 * @returns {number}
 */
export function run(argv, write) {
  const root = resolve(argv[0] ?? '.')
  return report([...checkDependencies(join(root, 'apps/api/src')), ...checkPackageImports(root)], write)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.error(line))
}
