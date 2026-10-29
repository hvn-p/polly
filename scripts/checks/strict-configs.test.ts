import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkStrictConfigs } from './strict-configs.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')
const base = readFileSync(join(repositoryRoot, 'tsconfig.base.json'), 'utf8')
const pyproject = readFileSync(join(repositoryRoot, 'services/compute/pyproject.toml'), 'utf8')
const biome = JSON.parse(readFileSync(join(repositoryRoot, 'biome.json'), 'utf8')) as {
  files: { includes: string[] }
  linter: { rules: Record<string, unknown> }
}
const manifest = readFileSync(join(repositoryRoot, 'package.json'), 'utf8')
const cargo = readFileSync(join(repositoryRoot, 'tools/architecture/analyzer/Cargo.toml'), 'utf8')

function biomeWith(rules: Record<string, unknown>): string {
  return JSON.stringify({ ...biome, linter: { ...biome.linter, rules: { ...biome.linter.rules, ...rules } } })
}

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

  it('refuses a Biome rule turned off, or down to info, without a recorded reason', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'biome.json': biomeWith({
        suspicious: { noExplicitAny: 'off', noDebugger: { level: 'info' } },
        complexity: { useLiteralKeys: 'off' },
      }),
    })
    expect(checkStrictConfigs(root)).toEqual([
      expect.stringMatching(/^biome\.json: suspicious\.noExplicitAny may not be off/),
      expect.stringMatching(/^biome\.json: suspicious\.noDebugger may not be info/),
    ])
  })

  it('refuses a path excluded from lint without a recorded reason, from the files or the linter', () => {
    const root = fixture({
      'tsconfig.base.json': base,
      'biome.json': JSON.stringify({
        ...biome,
        files: { includes: [...biome.files.includes, '!src/legacy'] },
        linter: { ...biome.linter, includes: ['**', '!apps/web/src/old.ts'] },
      }),
    })
    expect(checkStrictConfigs(root)).toEqual([
      'biome.json: files.includes excludes src/legacy from lint; record its reason in this guard',
      'biome.json: linter.includes excludes apps/web/src/old.ts from lint; record its reason in this guard',
    ])
  })

  it('refuses a Biome configuration that leaves the recommended rules', () => {
    const root = fixture({ 'tsconfig.base.json': base, 'biome.json': biomeWith({ preset: 'none' }) })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('biome.json: linter.rules.preset')])
  })

  it('refuses a lint script that lets warnings pass', () => {
    const relaxed = manifest.replace('biome check --error-on-warnings .', 'biome check .')
    const root = fixture({ 'tsconfig.base.json': base, 'package.json': relaxed })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('--error-on-warnings')])
  })

  it('refuses a ruff exclusion', () => {
    const relaxed = pyproject.replace(
      'line-length = 110',
      'line-length = 110\nextend-exclude = ["src/legacy"]',
    )
    const root = fixture({ 'tsconfig.base.json': base, 'svc/pyproject.toml': relaxed })
    expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('src/legacy')])
  })

  it('refuses S101 outside the tests', () => {
    const everywhere = pyproject.replace('"CPY001"]', '"CPY001", "S101"]')
    const inSource = pyproject.replace('"tests/**" = ["S101"]', '"tests/**" = ["S101"]\n"src/**" = ["S101"]')
    for (const relaxed of [everywhere, inSource]) {
      const root = fixture({ 'tsconfig.base.json': base, 'svc/pyproject.toml': relaxed })
      expect(checkStrictConfigs(root)).toEqual([expect.stringContaining('S101')])
    }
  })

  it('refuses a Cargo.toml that allows a lint, or leaves unsafe code or the clippy groups', () => {
    const relaxations: [string, string[]][] = [
      [cargo.replace('unsafe_code = "forbid"', 'unsafe_code = "warn"'), ['unsafe_code']],
      [
        cargo.replace(
          'pedantic = { level = "warn", priority = -1 }',
          'pedantic = { level = "allow", priority = -1 }',
        ),
        ['clippy.pedantic'],
      ],
      [cargo.replace('[lints.clippy]', '[lints.clippy]\nunwrap_used = "allow"'), ['clippy.unwrap_used']],
      [cargo.replace(/\[lints\.clippy\][^[]*/, ''), ['clippy.all', 'clippy.pedantic']],
    ]
    for (const [relaxed, named] of relaxations) {
      const root = fixture({ 'tsconfig.base.json': base, 'tool/Cargo.toml': relaxed })
      expect(checkStrictConfigs(root)).toEqual(
        named.map((lint) => expect.stringMatching(new RegExp(`^tool/Cargo\\.toml: lints\\.\\w*\\.?${lint}`))),
      )
    }
  })
})
