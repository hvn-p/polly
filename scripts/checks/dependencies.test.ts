import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDependencies, checkPackageImports, DEV_LAYOUT } from './dependencies.mjs'

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

const workspace = {
  'pnpm-workspace.yaml': 'packages:\n  - apps/*\n  - dev\n# a comment\nother: []\n',
  'apps/api/package.json': JSON.stringify({
    name: '@polly/api',
    exports: { './demo-account': './src/flows/seed-demo-account/index.ts' },
  }),
  'apps/api/src/flows/seed-demo-account/index.ts': "export * from './demo-account.ts'\n",
  'apps/api/src/flows/seed-demo-account/demo-account.ts': 'export const DEMO_ACCOUNT = {}\n',
  'apps/web/package.json': JSON.stringify({ name: '@polly/web' }),
  'dev/package.json': JSON.stringify({ name: '@polly/dev' }),
  'dev/src/e2e/claude.ts': "import { DEMO_ACCOUNT } from '@polly/api/demo-account'\nimport './redact.ts'\n",
  'dev/src/e2e/redact.ts': "import { z } from 'zod'\n",
}

describe('package imports guard', () => {
  it('accepts the repository as it is', () => {
    expect(checkPackageImports(repositoryRoot)).toEqual([])
  })

  it('accepts an import through an entry of the package exports', () => {
    expect(checkPackageImports(fixture(workspace))).toEqual([])
  })

  it('refuses a relative import into an inner file of another package, naming its exports', () => {
    const root = fixture({
      ...workspace,
      'dev/src/e2e/claude.ts':
        "import { DEMO_ACCOUNT } from '../../../apps/api/src/flows/seed-demo-account/demo-account.ts'\n",
    })
    expect(checkPackageImports(root)).toEqual([
      'dev/src/e2e/claude.ts imports apps/api/src/flows/seed-demo-account/demo-account.ts: ' +
        'import @polly/api through its package.json exports (@polly/api/demo-account)',
    ])
  })

  it('refuses a relative import into another package even from a test file', () => {
    const root = fixture({
      ...workspace,
      'dev/test/up.test.ts': "await import('../../apps/api/src/flows/seed-demo-account/index.ts')\n",
    })
    expect(checkPackageImports(root)).toEqual([
      expect.stringMatching(
        /^dev\/test\/up\.test\.ts imports apps\/api\/.*through its package\.json exports/,
      ),
    ])
  })

  it('refuses a package path its exports do not list', () => {
    const root = fixture({
      ...workspace,
      'dev/src/e2e/redact.ts': "import '@polly/api/src/flows/seed-demo-account/demo-account.ts'\n",
    })
    expect(checkPackageImports(root)).toEqual([
      expect.stringMatching(
        /^dev\/src\/e2e\/redact\.ts imports @polly\/api\/src\/.*not in its package\.json exports/,
      ),
    ])
  })

  it('refuses a package that exports nothing, naming the fix', () => {
    const root = fixture({ ...workspace, 'dev/src/e2e/redact.ts': "import '@polly/web'\n" })
    expect(checkPackageImports(root)).toEqual([
      expect.stringMatching(/imports @polly\/web: .*add the entry to its package\.json exports/),
    ])
  })
})

const devValid = {
  'main.ts': "import { up } from './commands/index.ts'\nimport { realInfrastructure } from './real.ts'\n",
  'real.ts': "import { processSupervisor } from './supervisor/index.ts'\n",
  'commands/index.ts': "export * from './up.ts'\n",
  'commands/up.ts':
    "import { realWorkerHolder } from './worker.ts'\nimport { readEnv } from '../worktree/index.ts'\n",
  'commands/worker.ts': "import { Refusal } from '../kernel/index.ts'\n",
  'worktree/index.ts': "import type { Infrastructure } from '../ports/index.ts'\n",
  'supervisor/index.ts': "import type { Supervisor } from '../ports/index.ts'\n",
  'ports/index.ts': "import type { ResourceNames } from '../identity/index.ts'\n",
  'identity/index.ts': 'export {}\n',
  'kernel/index.ts': 'export class Refusal {}\n',
}

describe('dependencies guard on dev/src', () => {
  it('accepts dev/src as it is', () => {
    expect(checkDependencies(join(repositoryRoot, 'dev/src'), DEV_LAYOUT)).toEqual([])
  })

  it('accepts downward imports between directories, through their index, and any import inside one', () => {
    expect(checkDependencies(fixture(devValid), DEV_LAYOUT)).toEqual([])
  })

  it('refuses an upward import and names the fix', () => {
    const root = fixture({ ...devValid, 'kernel/index.ts': "import '../commands/index.ts'\n" })
    expect(checkDependencies(root, DEV_LAYOUT)).toEqual([
      expect.stringMatching(
        /^kernel\/index\.ts imports commands\/index\.ts: dependencies point down \(entry > commands > .* > kernel\)/,
      ),
    ])
  })

  it('refuses an import of a module below the composition root from a lower module', () => {
    const root = fixture({ ...devValid, 'supervisor/index.ts': "import '../real.ts'\n" })
    expect(checkDependencies(root, DEV_LAYOUT)).toEqual([
      expect.stringMatching(/supervisor\/index\.ts imports real\.ts: dependencies point down/),
    ])
  })

  it('refuses an import that bypasses a directory index', () => {
    const root = fixture({
      ...devValid,
      'commands/worker.ts': "import { Refusal } from '../kernel/refusal.ts'\n",
      'kernel/refusal.ts': 'export class Refusal {}\n',
    })
    expect(checkDependencies(root, DEV_LAYOUT)).toEqual([
      expect.stringMatching(/commands\/worker\.ts imports kernel\/refusal\.ts: .*kernel\/index\.ts/),
    ])
  })

  it('refuses a directory that is not a tier', () => {
    const root = fixture({ ...devValid, 'helpers/index.ts': 'export {}\n' })
    expect(checkDependencies(root, DEV_LAYOUT)).toEqual([expect.stringMatching(/^helpers: not a tier/)])
  })
})
