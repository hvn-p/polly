import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { LAUNCHER } from '../release.mjs'

// The launcher installed in a project, with the given platform packages next to it.
function installed(platforms) {
  const project = mkdtempSync(join(tmpdir(), 'project-'))
  const modules = join(project, 'node_modules')
  const launcher = join(modules, '@probe', 'architecture')
  mkdirSync(launcher, { recursive: true })
  cpSync(join(LAUNCHER, 'bin'), join(launcher, 'bin'), { recursive: true })
  writeFileSync(
    join(launcher, 'package.json'),
    JSON.stringify({ name: '@probe/architecture', type: 'module' }),
  )
  for (const key of platforms) {
    const bin = join(modules, '@probe', `architecture-${key}`, 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, '..', 'package.json'), JSON.stringify({ name: `@probe/architecture-${key}` }))
    writeFileSync(join(bin, 'architecture-analyzer'), '#!/bin/sh\necho "analyzer $*"\nexit 3\n')
    chmodSync(join(bin, 'architecture-analyzer'), 0o755)
  }
  return join(launcher, 'bin', 'architecture.js')
}

const here = `${process.platform}-${process.arch}`

describe('launcher', () => {
  it("runs this platform's analyzer with the arguments, and exits with its status", () => {
    const run = spawnSync(process.execPath, [installed([here]), 'check', '--root', '.'], { encoding: 'utf8' })
    assert.equal(run.stdout, 'analyzer check --root .\n')
    assert.equal(run.status, 3)
  })

  it('names the platform when no analyzer was installed for it', () => {
    const run = spawnSync(process.execPath, [installed([])], { encoding: 'utf8' })
    assert.equal(run.status, 1)
    assert.match(run.stderr, new RegExp(`^ARCHITECTURE_PLATFORM_UNSUPPORTED: .*${here}`))
  })
})
