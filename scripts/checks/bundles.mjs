#!/usr/bin/env node
// Fails when a committed bundle differs from what its sources build
// (constitution principle VIII): it bundles each entry again and compares.
//
// Usage: node scripts/checks/bundles.mjs [root]

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLES, bundle } from '../build/bundles.ts'
import { report } from './report.mjs'

/**
 * @param {string} root
 * @param {import('../build/bundles.ts').Bundle[]} bundles
 * @returns {Promise<string[]>} one line per bundle missing or differing
 */
export async function checkBundles(root, bundles) {
  /** @type {string[]} */
  const violations = []
  for (const entry of bundles) {
    const file = join(root, entry.output)
    if (!existsSync(file)) {
      violations.push(`${entry.output} is missing; run nr bundles`)
    } else if (readFileSync(file, 'utf8') !== (await bundle(entry))) {
      violations.push(`${entry.output} differs from ${entry.entry}; run nr bundles, never edit a bundle`)
    }
  }
  return violations
}

/**
 * The command line: `node scripts/checks/bundles.mjs [path]`.
 * @param {string[]} argv
 * @param {(line: string) => void} write
 * @returns {Promise<number>}
 */
export async function run(argv, write) {
  return report(await checkBundles(resolve(argv[0] ?? '.'), BUNDLES), write)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2), (line) => console.error(line))
}
