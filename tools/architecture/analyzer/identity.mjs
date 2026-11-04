#!/usr/bin/env node
// The identity of the analyzer's sources: a fingerprint of the files that
// build it (its tests and build output aside), and the last commit that changed
// them. The analyzer's build embeds it (build.rs) and the view's build embeds
// it too, so the view says when the analyzer serving it was built from other
// sources than its own.
//
// Usage: node identity.mjs [directory], prints the identity as JSON, or null
// outside a git checkout.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// What does not change the analyzer's binary.
const OUTSIDE = [':!tests']

/**
 * @typedef {object} Identity
 * @property {string} fingerprint SHA-256 over each source's path and content
 * @property {string} commit the last commit that changed the sources, abbreviated
 * @property {string} date that commit's date, ISO 8601
 * @property {boolean} modified whether the sources differ from that commit
 * @property {string} [changed] when modified, when the latest local change was
 *   saved, ISO 8601: what tells two builds of the same commit apart
 */

/**
 * A time in ISO 8601 with the machine's offset, as git writes a commit's date.
 * @param {Date} date
 * @returns {string}
 */
export function localIso(date) {
  const offset = -date.getTimezoneOffset()
  const pad = (/** @type {number} */ n) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19)
  return `${local}${offset < 0 ? '-' : '+'}${pad(offset / 60)}:${pad(offset % 60)}`
}

/**
 * @param {string} directory
 * @returns {(args: string[], input?: string) => string}
 */
function gitIn(directory) {
  return (args, input) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      ...(input === undefined ? {} : { input }),
    })
}

/**
 * The files that build the analyzer, relative to its directory, sorted.
 * @param {string} directory the analyzer's directory
 * @returns {string[]}
 */
export function analyzerSources(directory) {
  const paths = gitIn(directory)([
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    '.',
    ...OUTSIDE,
  ])
    .split('\0')
    .filter((path) => path !== '' && existsSync(join(directory, path)))
  return [...new Set(paths)].sort()
}

/**
 * @param {string} directory the analyzer's directory
 * @returns {Identity | undefined}
 */
export function analyzerIdentity(directory) {
  const git = gitIn(directory)
  try {
    const sources = analyzerSources(directory)
    // Absolute: git reads these paths from the repository's top.
    const absolute = sources.map((path) => join(directory, path))
    const blobs =
      sources.length === 0
        ? []
        : git(['hash-object', '--stdin-paths'], `${absolute.join('\n')}\n`).split('\n')
    const fingerprint = createHash('sha256')
      .update(sources.map((path, index) => `${path}\0${blobs[index]}\n`).join(''))
      .digest('hex')
    const [commit = '', date = ''] = git(['log', '-1', '--format=%h%x09%cI', '--', '.', ...OUTSIDE])
      .trim()
      .split('\t')
    // Each changed source, its path relative to the repository's top.
    const top = git(['rev-parse', '--show-toplevel']).trim()
    const changes = git(['status', '--porcelain', '-z', '--', '.', ...OUTSIDE])
      .split('\0')
      .filter((entry) => entry.length > 3)
      .map((entry) => join(top, entry.slice(3)))
    const modified = changes.length > 0
    const times = changes.filter((path) => existsSync(path)).map((path) => statSync(path).mtime.getTime())
    return {
      fingerprint,
      commit,
      date,
      modified,
      ...(times.length === 0 ? {} : { changed: localIso(new Date(Math.max(...times))) }),
    }
  } catch {
    return undefined
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    `${JSON.stringify(analyzerIdentity(resolve(process.argv[2] ?? import.meta.dirname)) ?? null)}\n`,
  )
}
