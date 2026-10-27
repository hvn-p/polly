#!/usr/bin/env node
// Fails when a generated contract differs from its Zod source (constitution
// principle VIII): it renders every contract again and compares each copy.
//
// Usage: node scripts/checks/contracts.mjs [root]

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTRACTS, render } from '../contracts/generate.ts'
import { report } from './report.mjs'

/**
 * @param {string} root
 * @param {import('../contracts/generate.ts').Contract[]} contracts
 * @returns {Promise<string[]>} one line per copy that differs, naming its contract
 */
export async function checkContracts(root, contracts) {
  /** @type {string[]} */
  const violations = []
  for (const contract of contracts) {
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
