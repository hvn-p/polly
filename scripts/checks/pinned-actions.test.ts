import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkPinnedActions } from './pinned-actions.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')
const sha = '3d3c42e5aac5ba805825da76410c181273ba90b1'

function workflows(content: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pinned-actions-'))
  mkdirSync(join(root, '.github/workflows'), { recursive: true })
  writeFileSync(join(root, '.github/workflows/ci.yml'), content)
  return root
}

describe('pinned-actions guard', () => {
  it('accepts the repository as it is', () => {
    expect(checkPinnedActions(repositoryRoot)).toEqual([])
  })

  it('accepts actions pinned by a full SHA, and local actions', () => {
    const root = workflows(
      `steps:\n  - uses: actions/checkout@${sha} # v7\n  - uses: ./.github/actions/setup\n  - uses: "actions/cache@${sha}"\n`,
    )
    expect(checkPinnedActions(root)).toEqual([])
  })

  it('refuses an action referenced by a tag', () => {
    const root = workflows('steps:\n  - uses: actions/checkout@v7\n')
    expect(checkPinnedActions(root)).toEqual([
      expect.stringMatching(/ci\.yml:2: actions\/checkout@v7.*40-character/),
    ])
  })

  it('refuses an action referenced by a short SHA or no reference', () => {
    const root = workflows(
      'jobs:\n  a:\n    uses: org/repo/.github/workflows/x.yml@3d3c42e\n  b:\n    uses: org/action\n',
    )
    expect(checkPinnedActions(root)).toHaveLength(2)
  })

  it('refuses a docker image referenced by a tag', () => {
    const root = workflows('steps:\n  - uses: docker://alpine:3\n')
    expect(checkPinnedActions(root)).toEqual([expect.stringContaining('docker://alpine:3')])
  })
})
