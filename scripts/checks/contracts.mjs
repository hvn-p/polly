#!/usr/bin/env node
// Fails when a generated contract differs from its Zod source (constitution
// principle VIII): it renders every contract again and compares each copy. It
// also fails on a string or number field without bounds (principle XVI).
//
// Usage: node scripts/checks/contracts.mjs [root]

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { CONTRACTS, render } from '../contracts/generate.ts'
import { report } from './report.mjs'

/**
 * The fields of a JSON Schema whose strings have no maximum length, or whose
 * numbers lack a minimum or a maximum.
 * @param {unknown} schema
 * @param {string} path
 * @returns {{ path: string, type: 'string' | 'number' }[]}
 */
function unboundedFields(schema, path) {
  if (typeof schema !== 'object' || schema === null) {
    return []
  }
  const node = /** @type {Record<string, unknown>} */ (schema)
  const fixed = 'const' in node || 'enum' in node
  /** @type {{ path: string, type: 'string' | 'number' }[]} */
  const found = []
  if (node['type'] === 'string' && !fixed && !('maxLength' in node)) {
    found.push({ path, type: 'string' })
  }
  if (
    (node['type'] === 'number' || node['type'] === 'integer') &&
    !fixed &&
    !(('minimum' in node || 'exclusiveMinimum' in node) && ('maximum' in node || 'exclusiveMaximum' in node))
  ) {
    found.push({ path, type: 'number' })
  }
  for (const [name, child] of Object.entries(/** @type {object} */ (node['properties'] ?? {}))) {
    found.push(...unboundedFields(child, `${path}.${name}`))
  }
  found.push(...unboundedFields(node['items'], `${path}[]`))
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    for (const child of /** @type {unknown[]} */ (node[key] ?? [])) {
      found.push(...unboundedFields(child, path))
    }
  }
  return found
}

/**
 * @param {string} root
 * @param {import('../contracts/generate.ts').Contract[]} contracts
 * @returns {Promise<string[]>} one line per unbounded field or copy that differs, naming its contract
 */
export async function checkContracts(root, contracts) {
  /** @type {string[]} */
  const violations = []
  for (const contract of contracts) {
    for (const [name, schema] of Object.entries(await contract.load())) {
      for (const field of unboundedFields(z.toJSONSchema(schema), name)) {
        const bound = field.type === 'string' ? 'a maximum length' : 'a minimum and a maximum'
        violations.push(
          `${contract.name}: ${field.path} is an unbounded ${field.type}; give it ${bound} in ${contract.source}`,
        )
      }
    }
    for (const [path, expected] of await render(contract)) {
      const file = join(root, path)
      if (!existsSync(file)) {
        violations.push(`${contract.name}: ${path} is missing; run nr contracts`)
      } else if (readFileSync(file, 'utf8') !== expected) {
        violations.push(
          `${contract.name}: ${path} differs from ${contract.source}; run nr contracts, never edit a generated copy`,
        )
      }
    }
  }
  return violations
}

/**
 * The command line: `node scripts/checks/contracts.mjs [path]`.
 * @param {string[]} argv
 * @param {(line: string) => void} write
 * @returns {Promise<number>}
 */
export async function run(argv, write) {
  return report(await checkContracts(resolve(argv[0] ?? '.'), CONTRACTS), write)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2), (line) => console.error(line))
}
