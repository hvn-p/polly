import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { run as contracts } from './contracts.mjs'
import { run as dependencies } from './dependencies.mjs'
import { run as pinnedActions } from './pinned-actions.mjs'
import { report } from './report.mjs'
import { run as strictConfigs } from './strict-configs.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')

function output() {
  const lines: string[] = []
  return { lines, write: (line: string) => lines.push(line) }
}

function root(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'guards-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(directory, path, '..'), { recursive: true })
    writeFileSync(join(directory, path), content)
  }
  return directory
}

describe('guard command lines', () => {
  it('exit 0 and print nothing on the repository as it is', async () => {
    const out = output()
    expect(strictConfigs([repositoryRoot], out.write)).toBe(0)
    expect(dependencies([repositoryRoot], out.write)).toBe(0)
    expect(pinnedActions([repositoryRoot], out.write)).toBe(0)
    expect(await contracts([repositoryRoot], out.write)).toBe(0)
    expect(out.lines).toEqual([])
  })

  it('exit 1 with one line per violation, and the fix when the guard names one', () => {
    const relaxed = root({ 'tsconfig.base.json': '{"compilerOptions":{}}' })
    const out = output()
    expect(strictConfigs([relaxed], out.write)).toBe(1)
    expect(out.lines.at(-1)).toMatch(/^Strictness is set once/)
    const unpinned = root({ '.github/workflows/ci.yml': 'steps:\n  - uses: actions/checkout@v7\n' })
    const pinned = output()
    expect(pinnedActions([unpinned], pinned.write)).toBe(1)
    expect(pinned.lines).toHaveLength(1)
    const tiers = root({
      'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
      'apps/api/package.json': '{"name":"@polly/api"}',
      'apps/api/src/kernel/a/index.ts': "import '../../flows/b/index.ts'\n",
      'apps/api/src/flows/b/index.ts': '',
    })
    expect(dependencies([tiers], output().write)).toBe(1)
  })

  it('reports nothing and exits 0 when there is nothing to report', () => {
    const out = output()
    expect(report([], out.write, 'fix')).toBe(0)
    expect(out.lines).toEqual([])
  })
})
