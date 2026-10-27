#!/usr/bin/env node
// Refuses a configuration that relaxes the strictness of the project's code
// (constitution principle XI): every tsconfig.json extends tsconfig.base.json
// without turning a strictness option off, the base keeps all of them, and
// every pyproject.toml keeps ruff on all rules and mypy strict.
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

// Ruff rules that may be ignored, and why: D203/D213 conflict with D211/D212,
// COM812 conflicts with the formatter, the repository carries no per-file
// copyright notice (CPY001), and tests assert with `assert` (S101).
const RUFF_ALLOWED_IGNORES = new Set(['D203', 'D213', 'COM812', 'CPY001', 'S101'])

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'vendors', '.venv', 'dist', '.specify'])

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
    const ignored = [...(lint.ignore ?? []), ...Object.values(lint['per-file-ignores'] ?? {}).flat()]
    for (const rule of ignored) {
      if (!RUFF_ALLOWED_IGNORES.has(rule)) {
        violations.push(`${label}: ruff rule ${rule} may not be ignored`)
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
 * @returns {string[]} one line per violation, empty when every configuration is strict
 */
export function checkStrictConfigs(root) {
  /** @type {string[]} */
  const violations = []
  checkTsconfigs(root, violations)
  checkPyprojects(root, violations)
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
    'Strictness is set once, in tsconfig.base.json and in each pyproject.toml: restore it.',
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (line) => console.error(line))
}
