import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workspaceDirectories } from './processes.ts'

function tree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'workspace-'))
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), '{}')
  }
  return root
}

describe('workspaceDirectories', () => {
  it('lists the root and every package pnpm-workspace.yaml names, a glob only where a package.json is', () => {
    const root = tree([
      'apps/api/package.json',
      'apps/web/package.json',
      'apps/notes/README.md',
      'dev/package.json',
    ])
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - apps/*\n  - "dev"\n# packages that are not listed:\nother:\n  - x\n',
    )
    expect(workspaceDirectories(root)).toEqual(['', 'apps/api', 'apps/web', 'dev'])
  })
})
