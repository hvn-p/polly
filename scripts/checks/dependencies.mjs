#!/usr/bin/env node
// Checks the dependency graph (constitution principle VII): modules in
// ordered tiers, imports point down only, no import between two modules of a
// tier that forbids it, a module is entered through its index.ts only, no
// cycle between modules. Between workspace packages: a package is entered
// through its package.json exports only, never one of its files.
//
// The API (apps/api/src): tiers entry > flows > domains > reference > kernel,
// each holding modules; no import between two flows or two domains; the
// migrations live in packages/migrations, never in the API.
// The dev commands (dev/src): each directory is one module and one tier; the
// files at the root are the composition root, above them all.
//
// Usage: node scripts/checks/dependencies.mjs [repository root]

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { report } from './report.mjs'

/**
 * @typedef {object} Layout
 * @property {string[]} tiers the tiers, top first
 * @property {boolean} tiersHoldModules whether a tier's subdirectories are its
 *   modules, or the tier is a single module
 * @property {string[]} singleModuleTiers tiers that are one module even when
 *   tiers hold modules
 * @property {string | undefined} rootFiles the tier of the files at the root
 * @property {Record<string, string>} peerFixes tiers whose modules never
 *   import each other, with the fix
 * @property {Record<string, string>} misplaced directories that do not belong
 *   here, with where they belong
 */

/** @type {Layout} */
export const API_LAYOUT = {
  tiers: ['entry', 'flows', 'domains', 'reference', 'kernel'],
  tiersHoldModules: true,
  singleModuleTiers: ['entry'],
  rootFiles: undefined,
  peerFixes: {
    flows: 'two flows never import each other: compose them in entry',
    domains:
      'two domains never import each other: declare a port in the importing domain and feed it from a flow',
  },
  misplaced: {
    migrations: 'the database belongs to Polly, not to the API; move them to packages/migrations',
  },
}

/** @type {Layout} */
export const DEV_LAYOUT = {
  tiers: [
    'entry',
    'commands',
    'e2e',
    'worktree',
    'supervisor',
    'infra',
    'machine',
    'ports',
    'config',
    'identity',
    'kernel',
  ],
  tiersHoldModules: false,
  singleModuleTiers: [],
  rootFiles: 'entry',
  peerFixes: {},
  misplaced: {},
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
 * The location of a file inside src: its tier, its module and whether it is
 * the module's entry point.
 * @param {string} path relative to src, with forward slashes
 * @param {Layout} layout
 */
function locate(path, layout) {
  const [tier = '', first = '', ...rest] = path.split('/')
  if (first === '' && layout.rootFiles !== undefined) {
    return { tier: layout.rootFiles, module: layout.rootFiles, isEntryPoint: true }
  }
  if (layout.singleModuleTiers.includes(tier)) {
    return { tier, module: tier, isEntryPoint: true }
  }
  if (!layout.tiersHoldModules) {
    return { tier, module: tier, isEntryPoint: first === 'index.ts' && rest.length === 0 }
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
 * @param {string} src the source directory
 * @param {Layout} [layout]
 * @returns {string[]} one line per violation, each naming its fix
 */
export function checkDependencies(src, layout = API_LAYOUT) {
  const { tiers } = layout
  /** @type {string[]} */
  const violations = []
  if (!existsSync(src)) {
    return violations
  }
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const fix = layout.misplaced[entry.name]
    if (fix !== undefined) {
      violations.push(`${entry.name}: ${fix}`)
    } else if (entry.isFile() && layout.rootFiles !== undefined) {
    } else if (!tiers.includes(entry.name)) {
      violations.push(`${entry.name}: not a tier; place it under one of ${tiers.join(', ')}`)
    }
  }

  /** @type {Map<string, Set<string>>} */
  const graph = new Map()
  for (const file of listSources(src)) {
    const from = relative(src, file).split(sep).join('/')
    const source = locate(from, layout)
    if (!tiers.includes(source.tier)) {
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
      const destination = locate(to, layout)
      if (destination.module === source.module) {
        continue
      }
      const prefix = `${from} imports ${to}`
      const sourceRank = tiers.indexOf(source.tier)
      const destinationRank = tiers.indexOf(destination.tier)
      if (destinationRank < sourceRank) {
        violations.push(
          `${prefix}: dependencies point down (${tiers.join(' > ')}); ` +
            'move the shared part down, or compose both in the tier above',
        )
        continue
      }
      const peerFix = layout.peerFixes[source.tier]
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
  return report(
    [
      ...checkDependencies(join(root, 'apps/api/src'), API_LAYOUT),
      ...checkDependencies(join(root, 'dev/src'), DEV_LAYOUT),
      ...checkPackageImports(root),
    ],
    write,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.error(line))
}
