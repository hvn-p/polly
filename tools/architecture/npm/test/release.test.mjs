import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { LAUNCHER, nextVersion, PLATFORMS, writePackages } from '../release.mjs'

describe('release', () => {
  it('starts at 0.1.0, then bumps the patch of the version last published', () => {
    assert.equal(nextVersion(undefined), '0.1.0')
    assert.equal(nextVersion('0.1.4'), '0.1.5')
    assert.equal(nextVersion('1.2.9'), '1.2.10')
  })

  it('writes one package per platform with its binary, and the launcher depending on each at the version', () => {
    const binaries = mkdtempSync(join(tmpdir(), 'binaries-'))
    for (const platform of PLATFORMS) {
      mkdirSync(join(binaries, platform.key))
      writeFileSync(join(binaries, platform.key, 'architecture-analyzer'), `binary for ${platform.key}`)
    }
    const out = mkdtempSync(join(tmpdir(), 'packages-'))
    const written = writePackages({ version: '0.1.5', binaries, out })

    const name = JSON.parse(readFileSync(join(LAUNCHER, 'package.json'), 'utf8')).name
    assert.deepEqual(written, [...PLATFORMS.map(({ key }) => `${name}-${key}`), name])
    for (const platform of PLATFORMS) {
      const directory = join(out, `${name}-${platform.key}`.replace('/', '__'))
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
      assert.equal(manifest.name, `${name}-${platform.key}`)
      assert.equal(manifest.version, '0.1.5')
      assert.deepEqual([manifest.os, manifest.cpu], [[platform.os], [platform.cpu]])
      const binary = join(directory, 'bin', 'architecture-analyzer')
      assert.equal(readFileSync(binary, 'utf8'), `binary for ${platform.key}`)
      assert.equal(statSync(binary).mode & 0o111, 0o111)
      assert.equal(manifest.license, 'MIT')
      assert.match(readFileSync(join(directory, 'LICENSE'), 'utf8'), /^MIT License/)
    }
    const launcher = JSON.parse(readFileSync(join(out, name.replace('/', '__'), 'package.json'), 'utf8'))
    assert.equal(launcher.version, '0.1.5')
    assert.deepEqual(
      launcher.optionalDependencies,
      Object.fromEntries(PLATFORMS.map(({ key }) => [`${name}-${key}`, '0.1.5'])),
    )
    assert.ok(statSync(join(out, name.replace('/', '__'), 'bin', 'architecture.js')).isFile())
    assert.equal(launcher.license, 'MIT')
    assert.match(readFileSync(join(out, name.replace('/', '__'), 'LICENSE'), 'utf8'), /^MIT License/)
  })
})
