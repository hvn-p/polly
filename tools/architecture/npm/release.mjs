// Writes the npm packages of one release of the analyzer: one per platform,
// holding its binary, and the launcher, which depends on each at the same
// version and runs the one its machine installed. The release workflow runs it
// with the binaries CI built, then publishes the packages it lists.
//
// Usage: node release.mjs <version> <binaries directory> <output directory>
//   <binaries directory>/<platform key>/architecture-analyzer

import { chmodSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LAUNCHER = join(import.meta.dirname, 'launcher')

// The platforms a binary is built for, with the Rust target CI builds it with.
export const PLATFORMS = [
  { key: 'linux-x64', os: 'linux', cpu: 'x64', target: 'x86_64-unknown-linux-musl' },
  { key: 'linux-arm64', os: 'linux', cpu: 'arm64', target: 'aarch64-unknown-linux-musl' },
  { key: 'darwin-x64', os: 'darwin', cpu: 'x64', target: 'x86_64-apple-darwin' },
  { key: 'darwin-arm64', os: 'darwin', cpu: 'arm64', target: 'aarch64-apple-darwin' },
]

/**
 * The version after the one last published, 0.1.0 for the first.
 * @param {string | undefined} published
 */
export function nextVersion(published) {
  if (published === undefined) {
    return '0.1.0'
  }
  const [major, minor, patch] = published.split('.').map(Number)
  return `${major}.${minor}.${Number(patch) + 1}`
}

/**
 * @param {{ version: string, binaries: string, out: string }} release
 * @returns {string[]} the names of the packages written, in publication order
 */
export function writePackages({ version, binaries, out }) {
  const launcher = JSON.parse(readFileSync(join(LAUNCHER, 'package.json'), 'utf8'))
  /** @param {string} name */
  const directoryOf = (name) => join(out, name.replace('/', '__'))
  const names = []
  for (const platform of PLATFORMS) {
    const name = `${launcher.name}-${platform.key}`
    const directory = directoryOf(name)
    mkdirSync(join(directory, 'bin'), { recursive: true })
    const binary = join(directory, 'bin', 'architecture-analyzer')
    cpSync(join(binaries, platform.key, 'architecture-analyzer'), binary)
    chmodSync(binary, 0o755)
    writeFileSync(
      join(directory, 'package.json'),
      `${JSON.stringify(
        {
          name,
          version,
          description: `${launcher.description} (${platform.key} binary)`,
          repository: launcher.repository,
          os: [platform.os],
          cpu: [platform.cpu],
          files: ['bin'],
        },
        null,
        2,
      )}\n`,
    )
    names.push(name)
  }
  const directory = directoryOf(launcher.name)
  cpSync(LAUNCHER, directory, { recursive: true })
  const optionalDependencies = Object.fromEntries(names.map((name) => [name, version]))
  writeFileSync(
    join(directory, 'package.json'),
    `${JSON.stringify({ ...launcher, version, optionalDependencies }, null, 2)}\n`,
  )
  return [...names, launcher.name]
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [version, binaries, out] = process.argv.slice(2)
  if (version === undefined || binaries === undefined || out === undefined) {
    console.error('usage: node release.mjs <version> <binaries directory> <output directory>')
    process.exit(1)
  }
  for (const name of writePackages({ version, binaries: resolve(binaries), out: resolve(out) })) {
    console.log(join(resolve(out), name.replace('/', '__')))
  }
}
