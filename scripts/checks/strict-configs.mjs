#!/usr/bin/env node
// Refuses a configuration that relaxes the strictness of the project's code
// (constitution principle XI): every tsconfig.json extends tsconfig.base.json
// without turning a strictness option off, the base keeps all of them, Biome
// keeps its recommended rules and fails on a warning, and every
// pyproject.toml keeps ruff on all rules and mypy strict.
//
// Usage: node scripts/checks/strict-configs.mjs [root]

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  'pnpm-lock.yaml': 'written by pnpm',
  '.claude/skills/impeccable': 'an installed third-party skill',
  '.specify': "Spec Kit's installed scripts and the feature's artifact cache",
  'scripts/checks/agents-md.mjs': 'installed and tested by the baudrier plugin',
  '.claude/hooks/agents-md-reminder.mjs': 'installed and tested by the baudrier plugin',
}

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'vendors',
  '.venv',
  'dist',
  '.specify',
  'target',
])

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
      if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
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
 * @returns {string[]} one line per violation, empty when every configuration is strict
 */
export function checkStrictConfigs(root) {
  /** @type {string[]} */
  const violations = []
  checkTsconfigs(root, violations)
  checkBiome(root, violations)
  checkPyprojects(root, violations)
  checkCargo(root, violations)
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
