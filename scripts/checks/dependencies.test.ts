import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDependencies } from './dependencies.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dependencies-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const valid = {
  'entry/server.ts': "import { seed } from '../flows/seed/index.ts'\nimport { app } from './app.ts'\n",
  'entry/app.ts': "import { migrate } from '@polly/database'\n",
  'flows/seed/index.ts': "export * from './seed.ts'\n",
  'flows/seed/seed.ts': "import type { Memory } from '../../domains/memory/index.ts'\n",
  'domains/memory/index.ts': "export { now } from '../../kernel/clock/index.ts'\n",
  'reference/identity/index.ts': "const ids = await import('../../kernel/ids/index.ts')\n",
  'kernel/clock/index.ts': 'export const now = () => 0\n',
  'kernel/ids/index.ts': 'export const id = 1\n',
}

describe('dependencies guard', () => {
  it('accepts the repository as it is', () => {
    expect(checkDependencies(join(repositoryRoot, 'apps/api/src'))).toEqual([])
  })

  it('accepts downward imports through index files', () => {
    expect(checkDependencies(fixture(valid))).toEqual([])
  })

  it('refuses an upward import and names the fix', () => {
    const root = fixture({ ...valid, 'kernel/ids/index.ts': "import '../../flows/seed/index.ts'\n" })
    expect(checkDependencies(root)).toEqual([
      expect.stringMatching(/kernel\/ids\/index\.ts imports flows\/seed\/index\.ts.*point down.*tier above/),
    ])
  })

  it('refuses an import between two flows', () => {
    const root = fixture({
      ...valid,
      'flows/other/index.ts': "export { seed } from '../seed/index.ts'\n",
    })
    expect(checkDependencies(root)).toEqual([expect.stringMatching(/two flows.*compose them in entry/)])
  })

  it('refuses an import between two domains', () => {
    const root = fixture({
      ...valid,
      'domains/log/index.ts': "import type { Memory } from '../memory/index.ts'\n",
    })
    expect(checkDependencies(root)).toEqual([expect.stringMatching(/two domains.*port/)])
  })

  it('refuses an import that bypasses a module index', () => {
    const root = fixture({
      ...valid,
      'entry/server.ts': "import { seed } from '../flows/seed/seed.ts'\n",
    })
    expect(checkDependencies(root)).toEqual([
      expect.stringMatching(/through its index file: flows\/seed\/index\.ts/),
    ])
  })

  it('refuses migrations inside the API, naming the package they belong to', () => {
    const root = fixture({ ...valid, 'migrations/index.ts': "import { Kysely } from 'kysely'\n" })
    expect(checkDependencies(root)).toEqual([expect.stringMatching(/^migrations: .*packages\/database/)])
  })

  it('ignores a unit test sitting next to its file, which may assemble several tiers', () => {
    const root = fixture({
      ...valid,
      'kernel/ids/index.test.ts': "import '../../flows/seed/seed.ts'\nimport '../clock/index.ts'\n",
    })
    expect(checkDependencies(root)).toEqual([])
  })

  it('refuses a directory that is not a tier', () => {
    const root = fixture({ ...valid, 'utils/index.ts': 'export {}\n' })
    expect(checkDependencies(root)).toEqual([expect.stringMatching(/utils.*not a tier/)])
  })

  it('refuses a cycle between modules of one tier', () => {
    const root = fixture({
      ...valid,
      'kernel/clock/index.ts': "import '../ids/index.ts'\n",
      'kernel/ids/index.ts': "import '../clock/index.ts'\n",
    })
    expect(checkDependencies(root)).toEqual([
      expect.stringMatching(/cycle: kernel\/(clock|ids) -> .* -> kernel\/\1/),
    ])
  })
})
