#!/usr/bin/env node
// Refuses a CI action that is not pinned (constitution principle XVII): every
// `uses:` in .github/workflows/ names a 40-character commit SHA, or a docker
// image by digest. Local actions (`./…`) are part of the repository.
//
// Usage: node scripts/checks/pinned-actions.mjs [root]

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const USES = /^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)/
const PINNED_ACTION = /@[0-9a-f]{40}$/
const PINNED_IMAGE = /@sha256:[0-9a-f]{64}$/

/**
 * @param {string} root
 * @returns {string[]} one line per unpinned reference
 */
export function checkPinnedActions(root) {
  const directory = join(root, '.github/workflows')
  /** @type {string[]} */
  const violations = []
  if (!existsSync(directory)) {
    return violations
  }
  for (const name of readdirSync(directory).filter((file) => /\.ya?ml$/.test(file))) {
    readFileSync(join(directory, name), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const reference = USES.exec(line)?.[1]
        if (reference === undefined || reference.startsWith('./')) {
          return
        }
        const pinned = reference.startsWith('docker://')
          ? PINNED_IMAGE.test(reference)
          : PINNED_ACTION.test(reference)
        if (!pinned) {
          violations.push(
            `${name}:${index + 1}: ${reference}: pin it by its 40-character commit SHA ` +
              '(a docker image by its sha256 digest), with the version in a comment',
          )
        }
      })
  }
  return violations
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkPinnedActions(resolve(process.argv[2] ?? '.'))
  for (const violation of violations) {
    console.error(violation)
  }
  if (violations.length > 0) {
    process.exit(1)
  }
}
