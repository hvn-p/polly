import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installDependencies } from '../src/infra/dependencies.ts'

function project(manifest: object): string {
  const root = mkdtempSync(join(tmpdir(), 'dependencies-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'probe', private: true, ...manifest }))
  return root
}

describe('dependency installation', { timeout: 30_000 }, () => {
  it('installs the workspace as its lockfile pins it', () => {
    const root = project({})
    installDependencies(root)
    expect(existsSync(join(root, 'node_modules'))).toBe(true)
  })

  it('fails when the lockfile does not match the manifests, rather than resolving anew', () => {
    const root = project({ dependencies: { 'left-pad': '1.3.0' } })
    expect(() => installDependencies(root)).toThrow()
    expect(existsSync(join(root, 'node_modules', 'left-pad'))).toBe(false)
  })
})
