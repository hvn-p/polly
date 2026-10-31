#!/usr/bin/env node
// Refuses a configuration that relaxes the strictness of the project's code
// (constitution principle XI): every tsconfig.json extends tsconfig.base.json
// without turning a strictness option off, the base keeps all of them, Biome
// keeps its recommended rules and fails on a warning, and every
// pyproject.toml keeps ruff on all rules and mypy strict. Every source file of
// the project's own code is type-checked by a tsconfig that `pnpm run
// typecheck` runs and measured by the coverage gate, unless this guard records
// why not (principles XI and XII).
//
// Usage: node scripts/checks/strict-configs.mjs [root]

import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, matchesGlob, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { report } from './report.mjs'

// The value each strictness option must hold, in the base and everywhere else.
const TS_STRICT = {
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noImplicitOverride: true,
  noPropertyAccessFromIndexSignature: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  allowUnreachableCode: false,
  allowUnusedLabels: false,
  verbatimModuleSyntax: true,
  erasableSyntaxOnly: true,
  forceConsistentCasingInFileNames: true,
  isolatedModules: true,
}

// Members of the `strict` family: turning one off relaxes `strict`.
const TS_STRICT_FAMILY = [
  'noImplicitAny',
  'noImplicitThis',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'strictPropertyInitialization',
  'strictBuiltinIteratorReturn',
  'alwaysStrict',
  'useUnknownInCatchVariables',
]

// Ruff rules that may be ignored everywhere, and why: D203/D213 conflict with
// D211/D212, COM812 conflicts with the formatter, the repository carries no
// per-file copyright notice (CPY001).
const RUFF_ALLOWED_IGNORES = new Set(['D203', 'D213', 'COM812', 'CPY001'])

// Ruff rules that may be ignored for some files only: tests assert with
// `assert` (S101).
/** @type {Record<string, string>} */
const RUFF_ALLOWED_FILE_IGNORES = { S101: 'tests/**' }

// Paths ruff may skip, and why: none, no Python is generated.
/** @type {Set<string>} */
const RUFF_ALLOWED_EXCLUDES = new Set()

// Biome rules that may be off, and why: noPropertyAccessFromIndexSignature
// requires `env['KEY']`, which useLiteralKeys would rewrite to `env.KEY`.
const BIOME_ALLOWED_OFF = new Set(['complexity/useLiteralKeys'])

// Paths Biome may leave out of lint, and why.
/** @type {Record<string, string>} */
const BIOME_ALLOWED_EXCLUDES = {
  node_modules: 'installed dependencies',
  vendors: "the platform's repository, read-only here and linted in its own",
  'plugin/monitors': 'bundled by esbuild from plugin/src (nr bundles)',
  'tools/architecture/ui/mockup': 'the validated design mockup, a reference for the view, never shipped',
  'pnpm-lock.yaml': 'written by pnpm',
  '.claude/skills/impeccable': 'an installed third-party skill',
  '.specify': "Spec Kit's installed scripts and the feature's artifact cache",
  'scripts/checks/agents-md.mjs': 'installed and tested by the baudrier plugin',
  '.claude/hooks/agents-md-reminder.mjs': 'installed and tested by the baudrier plugin',
}

// Source files that are not the project's own code to check, and why.
/** @type {Record<string, string>} */
const SOURCE_EXCLUDES = {
  'plugin/monitors/**': 'bundled by esbuild from plugin/src (nr bundles)',
  'scripts/checks/agents-md.mjs': 'installed and tested by the baudrier plugin',
}

// Source files the coverage gate may leave out, and why.
/** @type {Record<string, string>} */
const COVERAGE_EXCLUDES = {
  '**/*.test.{ts,tsx}': 'tests',
  '**/test/**': 'test support',
  '**/vitest.config.ts': 'test configuration',
  '**/vite.config.ts': 'build configuration, run by Vite',
  '**/*.d.ts': 'declarations, which hold no code to run',
  'vitest.setup.ts': 'test setup, tested by scripts/checks/outbound-network.test.ts',
  'dev/src/supervisor/main.ts':
    'a process entry point: the tests run it as the process it is (dev:up), and V8 coverage does not follow a child process',
  'plugin/src/agent-events.ts':
    "the plugin's monitor: its tests spawn its committed bundle, as Claude Code runs it",
  'tools/architecture/npm/launcher/bin/architecture.js':
    "the analyzer's published launcher: its tests run it as npm installs it, in a child process",
  'dev/src/e2e/claude.ts': 'the driven agent run: on demand, never in CI (nr dev:e2e)',
  'packages/migrations/src/migrations/**':
    "applied by the tests' global setups, in their own process; the startup tests check the schema they produce",
}

const SOURCE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/
const JAVASCRIPT = /\.(js|mjs|cjs)$/

// Directories the walk skips, wherever they are, and why. Any other directory,
// a dot-directory included, is walked.
/** @type {Record<string, string>} */
const SKIPPED_DIRECTORIES = {
  node_modules: 'installed dependencies',
  vendors: "the platform's repository, checked in its own",
  dist: 'build output',
  target: "the analyzer's Rust build output",
  '.git': "git's own data",
  '.venv': "the compute service's Python environment, installed by uv",
  '.mypy_cache': "mypy's cache",
  '.pytest_cache': "pytest's cache",
  '.ruff_cache': "ruff's cache",
  '.claude': "Claude Code's configuration: installed skills and the baudrier plugin's hook",
  '.specify': "Spec Kit's installed scripts and extensions, and the feature's artifact cache",
  '.github': 'the CI workflows, which hold no source file',
  '.dev': "a worktree's runtime state and logs, written by dev:up",
}

/**
 * @param {string} root
 * @param {string} name
 * @param {string} directory
 * @param {string[]} found
 * @returns {string[]}
 */
function findFiles(root, name, directory = root, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!Object.hasOwn(SKIPPED_DIRECTORIES, entry.name)) {
        findFiles(root, name, join(directory, entry.name), found)
      }
    } else if (entry.name === name) {
      found.push(join(directory, entry.name))
    }
  }
  return found
}

/** @param {string} path */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} options
 * @param {string[]} violations
 * @param {{ requireAll: boolean }} mode
 */
function checkTsOptions(label, options, violations, { requireAll }) {
  for (const [option, expected] of Object.entries(TS_STRICT)) {
    const value = options[option]
    if (value === undefined ? requireAll : value !== expected) {
      violations.push(`${label}: compilerOptions.${option} must be ${expected}`)
    }
  }
  for (const option of TS_STRICT_FAMILY) {
    if (options[option] === false) {
      violations.push(`${label}: compilerOptions.${option} must not be false; it relaxes strict`)
    }
  }
}

/**
 * @param {string} root
 * @param {string[]} violations
 */
function checkTsconfigs(root, violations) {
  const basePath = join(root, 'tsconfig.base.json')
  if (!existsSync(basePath)) {
    violations.push('tsconfig.base.json: missing')
    return
  }
  checkTsOptions('tsconfig.base.json', readJson(basePath).compilerOptions ?? {}, violations, {
    requireAll: true,
  })

  for (const path of findFiles(root, 'tsconfig.json')) {
    const label = relative(root, path)
    const config = readJson(path)
    if (typeof config.extends !== 'string' || resolve(dirname(path), config.extends) !== basePath) {
      violations.push(`${label}: extend tsconfig.base.json (${relative(dirname(path), basePath)})`)
      continue
    }
    checkTsOptions(label, config.compilerOptions ?? {}, violations, { requireAll: false })
  }
}

/** @param {string} path */
function readToml(path) {
  const script = 'import json,sys,tomllib; print(json.dumps(tomllib.load(open(sys.argv[1], "rb"))))'
  return JSON.parse(execFileSync('python3', ['-c', script, path], { encoding: 'utf8' }))
}

/**
 * @param {string} root
 * @param {string[]} violations
 */
function checkPyprojects(root, violations) {
  for (const path of findFiles(root, 'pyproject.toml')) {
    const label = relative(root, path)
    const tool = readToml(path).tool ?? {}
    const lint = tool.ruff?.lint ?? {}

    if (JSON.stringify(lint.select) !== JSON.stringify(['ALL'])) {
      violations.push(`${label}: tool.ruff.lint.select must be ["ALL"]`)
    }
    for (const rule of lint.ignore ?? []) {
      if (!RUFF_ALLOWED_IGNORES.has(rule)) {
        violations.push(`${label}: ruff rule ${rule} may not be ignored`)
      }
    }
    for (const [pattern, rules] of Object.entries(lint['per-file-ignores'] ?? {})) {
      for (const rule of /** @type {string[]} */ (rules)) {
        if (!RUFF_ALLOWED_IGNORES.has(rule) && RUFF_ALLOWED_FILE_IGNORES[rule] !== pattern) {
          violations.push(`${label}: ruff rule ${rule} may not be ignored for ${pattern}`)
        }
      }
    }
    for (const path of [...(tool.ruff?.exclude ?? []), ...(tool.ruff?.['extend-exclude'] ?? [])]) {
      if (!RUFF_ALLOWED_EXCLUDES.has(path)) {
        violations.push(`${label}: ruff may not skip ${path}`)
      }
    }
    if (lint['extend-ignore'] !== undefined || tool.ruff?.['extend-ignore'] !== undefined) {
      violations.push(`${label}: ruff extend-ignore is not allowed; use tool.ruff.lint.ignore`)
    }

    const mypy = tool.mypy ?? {}
    if (mypy.strict !== true) {
      violations.push(`${label}: tool.mypy.strict must be true`)
    }
    for (const [option, value] of Object.entries(mypy)) {
      if ((option.startsWith('disallow_') || option.startsWith('warn_')) && value === false) {
        violations.push(`${label}: tool.mypy.${option} must not be false; it relaxes strict`)
      }
      if (option === 'ignore_errors' && value === true) {
        violations.push(`${label}: tool.mypy.ignore_errors must not be true`)
      }
    }
    if (Array.isArray(mypy.overrides)) {
      violations.push(`${label}: tool.mypy.overrides is not allowed; it relaxes strict per module`)
    }
  }
}

/**
 * @param {string} root
 * @param {string[]} violations
 */
function checkBiome(root, violations) {
  const path = join(root, 'biome.json')
  if (existsSync(path)) {
    const config = readJson(path)
    const linter = config.linter ?? {}
    for (const [key, includes] of [
      ['files.includes', config.files?.includes],
      ['linter.includes', linter.includes],
    ]) {
      for (const pattern of Array.isArray(includes) ? includes : []) {
        const excluded = typeof pattern === 'string' && pattern.startsWith('!') ? pattern.slice(1) : undefined
        if (excluded !== undefined && !Object.hasOwn(BIOME_ALLOWED_EXCLUDES, excluded)) {
          violations.push(
            `biome.json: ${key} excludes ${excluded} from lint; record its reason in this guard`,
          )
        }
      }
    }
    if (linter.enabled === false) {
      violations.push('biome.json: linter.enabled must not be false')
    }
    const { preset = 'recommended', ...groups } = linter.rules ?? {}
    if (preset !== 'recommended' && preset !== 'all') {
      violations.push('biome.json: linter.rules.preset must be recommended or all')
    }
    for (const [group, rules] of Object.entries(groups)) {
      for (const [rule, setting] of Object.entries(
        typeof rules === 'object' && rules !== null ? rules : {},
      )) {
        const level = typeof setting === 'object' && setting !== null ? setting.level : setting
        if ((level === 'off' || level === 'info') && !BIOME_ALLOWED_OFF.has(`${group}/${rule}`)) {
          violations.push(`biome.json: ${group}.${rule} may not be ${level}; record its reason in this guard`)
        }
      }
    }
  }
  const manifest = join(root, 'package.json')
  if (existsSync(manifest)) {
    const lint = readJson(manifest).scripts?.lint ?? ''
    if (!/\bbiome check\b/.test(lint) || !lint.includes('--error-on-warnings')) {
      violations.push('package.json: the lint script must run biome check --error-on-warnings')
    }
  }
}

// Every Rust crate forbids unsafe code and turns on clippy's default and pedantic
// groups, which CI runs with warnings as errors; no lint is allowed in a manifest.
const CLIPPY_GROUPS = ['all', 'pedantic']

/**
 * @param {string} root
 * @param {string[]} violations
 */
function checkCargo(root, violations) {
  for (const path of findFiles(root, 'Cargo.toml')) {
    const label = relative(root, path)
    /** @type {Record<string, Record<string, unknown>>} */
    const lints = readToml(path).lints ?? {}
    /** @param {unknown} setting */
    const level = (setting) =>
      typeof setting === 'object' && setting !== null ? Reflect.get(setting, 'level') : setting
    if (level(lints['rust']?.['unsafe_code']) !== 'forbid') {
      violations.push(`${label}: lints.rust.unsafe_code must be "forbid"`)
    }
    for (const group of CLIPPY_GROUPS) {
      if (!['warn', 'deny', 'forbid'].includes(String(level(lints['clippy']?.[group])))) {
        violations.push(`${label}: lints.clippy.${group} must be on (warn, which CI denies)`)
      }
    }
    for (const [tool, table] of Object.entries(lints)) {
      for (const [lint, setting] of Object.entries(table)) {
        if (level(setting) === 'allow' && !(tool === 'clippy' && CLIPPY_GROUPS.includes(lint))) {
          violations.push(`${label}: lints.${tool}.${lint} is allowed; fix the code instead`)
        }
      }
    }
  }
}

/**
 * @param {string} root
 * @param {string} directory
 * @param {string[]} found
 * @returns {string[]} the source files under root, as paths relative to it
 */
function findSources(root, directory = root, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!Object.hasOwn(SKIPPED_DIRECTORIES, entry.name)) {
        findSources(root, join(directory, entry.name), found)
      }
    } else if (SOURCE_EXTENSIONS.test(entry.name)) {
      found.push(relative(root, join(directory, entry.name)).split(sep).join('/'))
    }
  }
  return found
}

/**
 * @param {string} path
 * @param {Record<string, string>} patterns
 */
function matchesAny(path, patterns) {
  return Object.keys(patterns).some((pattern) => matchesGlob(path, pattern))
}

/**
 * Whether a tsconfig's include or exclude entry, relative to its directory, holds a file:
 * a path names that file or everything under that directory, a pattern is a glob.
 * @param {string} file relative to the repository
 * @param {string} entry
 * @param {string} directory the tsconfig's directory, relative to the repository
 */
function covers(file, entry, directory) {
  const target = join(directory, entry).split(sep).join('/')
  if (/[*?]/.test(entry)) {
    return matchesGlob(file, target)
  }
  return target === '.' || file === target || file.startsWith(`${target}/`)
}

/**
 * The workspace packages pnpm-workspace.yaml lists, as directories holding a package.json.
 * @param {string} root
 * @returns {string[]}
 */
function workspacePackages(root) {
  const path = join(root, 'pnpm-workspace.yaml')
  if (!existsSync(path)) {
    return []
  }
  const section = /^packages:\n((?:[ \t]+-.*\n?)*)/m.exec(readFileSync(path, 'utf8'))?.[1] ?? ''
  const patterns = [...section.matchAll(/^[ \t]+-[ \t]*['"]?([^'"\n]+?)['"]?[ \t]*$/gm)].map(
    (match) => match[1] ?? '',
  )
  return patterns
    .flatMap((pattern) => globSync(pattern, { cwd: root }))
    .map((directory) => join(root, directory))
    .filter((directory) => existsSync(join(directory, 'package.json')))
}

/**
 * The tsconfigs a typecheck script runs from its directory: `tsc -p <project>`, or
 * `tsc` alone for the directory's own; at the root, `pnpm -r run typecheck` adds
 * those each workspace package's typecheck script runs.
 * @param {string} root
 * @param {string} directory
 * @returns {string[]} absolute paths
 */
function tsconfigsRun(root, directory) {
  const script = readJson(join(directory, 'package.json')).scripts?.typecheck ?? ''
  /** @type {string[]} */
  const found = []
  for (const command of String(script)
    .split('&&')
    .map((part) => part.trim())) {
    const tsc = /^tsc\b(.*)$/.exec(command)
    if (tsc !== null) {
      const project = /(?:^|\s)(?:-p|--project)\s+(\S+)/.exec(tsc[1] ?? '')?.[1] ?? '.'
      const path = resolve(directory, project)
      found.push(path.endsWith('.json') ? path : join(path, 'tsconfig.json'))
    } else if (directory === root && /^pnpm\b.*\s(?:-r|--recursive)\b.*\brun typecheck\b/.test(command)) {
      for (const pkg of workspacePackages(root)) {
        found.push(...tsconfigsRun(root, pkg))
      }
    }
  }
  return found
}

/**
 * The files each tsconfig `pnpm run typecheck` runs type-checks, read from its include,
 * files and exclude, as tsc reads them; JavaScript only under checkJs.
 * @param {string} root
 * @param {string[]} sources relative to root
 * @returns {Set<string>}
 */
function typeCheckedFiles(root, sources) {
  /** @type {Set<string>} */
  const checked = new Set()
  const run = existsSync(join(root, 'package.json')) ? tsconfigsRun(root, root) : []
  for (const path of new Set(run.filter((config) => existsSync(config)))) {
    const config = readJson(path)
    const directory = relative(root, dirname(path))
    const checkJs = config.compilerOptions?.checkJs === true
    /** @type {string[]} */
    const include = config.include ?? (config.files === undefined ? ['**/*'] : [])
    /** @type {string[]} */
    const exclude = config.exclude ?? []
    /** @type {string[]} */
    const files = config.files ?? []
    for (const file of sources) {
      const listed =
        files.some((entry) => covers(file, entry, directory)) ||
        (include.some((entry) => covers(file, entry, directory)) &&
          !exclude.some((entry) => covers(file, entry, directory)))
      if (listed && (checkJs || !JAVASCRIPT.test(file))) {
        checked.add(file)
      }
    }
  }
  return checked
}

/**
 * @param {string} root
 * @returns {{ include: string[], exclude: string[] } | undefined}
 */
function coverageOf(root) {
  const path = join(root, 'vitest.config.ts')
  if (!existsSync(path)) {
    return undefined
  }
  const script =
    'const { test } = (await import(process.argv[1])).default; console.log(JSON.stringify(test.coverage))'
  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script, pathToFileURL(path).href],
    { encoding: 'utf8', cwd: root },
  )
  const coverage = JSON.parse(output)
  return { include: coverage.include ?? [], exclude: coverage.exclude ?? [] }
}

/**
 * @param {string} root
 * @param {string[]} violations
 */
function checkSources(root, violations) {
  const sources = findSources(root).filter((file) => !matchesAny(file, SOURCE_EXCLUDES))
  const checked = typeCheckedFiles(root, sources)
  for (const file of sources) {
    if (!checked.has(file)) {
      violations.push(`${file}: no tsconfig type-checks it; include it in one (with checkJs for JavaScript)`)
    }
  }

  const coverage = coverageOf(root)
  if (coverage === undefined) {
    return
  }
  for (const pattern of coverage.exclude) {
    if (!Object.hasOwn(COVERAGE_EXCLUDES, pattern) && !Object.hasOwn(SOURCE_EXCLUDES, pattern)) {
      violations.push(
        `vitest.config.ts: coverage.exclude leaves out ${pattern}; record its reason in this guard`,
      )
    }
  }
  for (const file of sources) {
    const measured =
      coverage.include.some((pattern) => matchesGlob(file, pattern)) &&
      !coverage.exclude.some((pattern) => matchesGlob(file, pattern))
    if (!measured && !matchesAny(file, COVERAGE_EXCLUDES)) {
      violations.push(
        `${file}: outside the coverage gate; add it to the coverage include of vitest.config.ts, or record its exclusion and reason in this guard`,
      )
    }
  }
}

/**
 * @param {string} root
 * @returns {string[]} one line per violation, empty when every configuration is strict
 */
export function checkStrictConfigs(root) {
  /** @type {string[]} */
  const violations = []
  checkTsconfigs(root, violations)
  checkBiome(root, violations)
  checkPyprojects(root, violations)
  checkCargo(root, violations)
  checkSources(root, violations)
  return violations
}

/**
 * The command line: `node scripts/checks/strict-configs.mjs [path]`.
 * @param {string[]} argv
 * @param {(line: string) => void} write
 * @returns {number}
 */
export function run(argv, write) {
  return report(
    checkStrictConfigs(resolve(argv[0] ?? '.')),
    write,
    'Strictness is set once, in tsconfig.base.json, biome.json and each pyproject.toml: restore it.',
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.error(line))
}
