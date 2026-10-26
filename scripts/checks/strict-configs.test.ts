import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkStrictConfigs } from './strict-configs.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')
const base = readFileSync(join(repositoryRoot, 'tsconfig.base.json'), 'utf8')
const pyproject = readFileSync(join(repositoryRoot, 'services/pron-worker/pyproject.toml'), 'utf8')

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'strict-configs-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const packageConfig = JSON.stringify({ extends: '../tsconfig.base.json', include: ['src'] })

describe('strict-configs guard', () => {
  it('accepts the repository as it is', () => {
    expect(checkStrictConfigs(repositoryRoot)).toEqual([])
  })

  it('accepts a package that changes a non-strictness option', () => {
    const config = JSON.stringify({ extends: '../tsconfig.base.json', compilerOptions: { jsx: 'react-jsx' } })
    const root = fixture({ 'tsconfig.base.json': base, 'pkg/tsconfig.json': config })
    expect(checkStrictConfigs(root)).toEqual([])
  })

  it('refuses a tsconfig that does not extend the base', () => {
    const root = fixture({ 'tsconfig.base.json': base, 'pkg/tsconfig.json': '{"compilerOptions":{}}' })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('pkg/tsconfig.json: extend')])
  })

  it('refuses a tsconfig that relaxes a strictness option of the base', () => {
    const config = JSON.stringify({
      extends: '../tsconfig.base.json',
      compilerOptions: { noUncheckedIndexedAccess: false },
    })
    const root = fixture({ 'tsconfig.base.json': base, 'pkg/tsconfig.json': config })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('noUncheckedIndexedAccess')])
  })

  it('refuses a tsconfig that turns off one member of the strict family', () => {
    const config = JSON.stringify({
      extends: '../tsconfig.base.json',
      compilerOptions: { strictNullChecks: false },
    })
    const root = fixture({ 'tsconfig.base.json': base, 'pkg/tsconfig.json': config })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('strictNullChecks')])
  })

  it('refuses a base that lost a strictness option', () => {
    const relaxed = JSON.parse(base) as { compilerOptions: { exactOptionalPropertyTypes: boolean } }
    relaxed.compilerOptions.exactOptionalPropertyTypes = false
    const root = fixture({
      'tsconfig.base.json': JSON.stringify(relaxed),
      'pkg/tsconfig.json': packageConfig,
    })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('exactOptionalPropertyTypes')])
  })

  it('refuses a pyproject that narrows the ruff selection', () => {
    const relaxed = pyproject.replace('select = ["ALL"]', 'select = ["E", "F"]')
    const root = fixture({ 'tsconfig.base.json': base, 'svc/pyproject.toml': relaxed })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('ruff')])
  })

  it('refuses a pyproject that ignores a ruff rule outside the allowed list', () => {
    const relaxed = pyproject.replace('"CPY001"]', '"CPY001", "ANN401"]')
    const root = fixture({ 'tsconfig.base.json': base, 'svc/pyproject.toml': relaxed })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('ANN401')])
  })

  it('refuses a pyproject that turns mypy strictness off', () => {
    const relaxed = pyproject.replace('strict = true', 'strict = false')
    const root = fixture({ 'tsconfig.base.json': base, 'svc/pyproject.toml': relaxed })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('mypy')])
  })

  it('refuses a pyproject that relaxes one mypy flag', () => {
    const relaxed = pyproject.replace('strict = true', 'strict = true\ndisallow_untyped_defs = false')
    const root = fixture({ 'tsconfig.base.json': base, 'svc/pyproject.toml': relaxed })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('disallow_untyped_defs')])
  })
})
