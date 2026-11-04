import { describe, expect, it } from 'vitest'
import { deriveIdentity, releaseKeyOf, resourceNames } from './index.ts'

const POSTGRES_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

function expectValidNames(identity: string): void {
  const names = resourceNames(identity)
  expect(names.database).toMatch(POSTGRES_IDENTIFIER)
  expect(names.testDatabase).toMatch(POSTGRES_IDENTIFIER)
  expect(names.testDatabase.endsWith('_test')).toBe(true)
  expect(names.role).toMatch(POSTGRES_IDENTIFIER)
  expect(names.bucket).toMatch(BUCKET)
  expect(names.host.split('.')[0]).toMatch(DNS_LABEL)
  expect(names.host.endsWith('.polly.localhost')).toBe(true)
}

describe('worktree identity', () => {
  it('keeps a branch that is already valid', () => {
    expect(deriveIdentity('4-worktree-dev-env')).toBe('4-worktree-dev-env')
    expect(resourceNames('4-worktree-dev-env')).toEqual({
      database: 'polly_4_worktree_dev_env',
      testDatabase: 'polly_4_worktree_dev_env__test',
      role: 'polly_4_worktree_dev_env',
      bucket: 'polly-4-worktree-dev-env',
      host: '4-worktree-dev-env.polly.localhost',
    })
  })

  it('C10: makes characters invalid for a resource name valid', () => {
    const identity = deriveIdentity('Feature/Ünïcode_Name!')
    expect(identity).toMatch(/^feature-unicode-name-[0-9a-f]{4}$/)
    expectValidNames(identity)
  })

  it('C11: keeps a 40-character result as is, cuts a 41-character one with a hash suffix', () => {
    const forty = 'a'.repeat(40)
    expect(deriveIdentity(forty)).toBe(forty)
    const fortyOne = `${'a'.repeat(39)}-b`
    const cut = deriveIdentity(fortyOne)
    expect(cut).toMatch(/^a{39}-[0-9a-f]{4}$/)
    expectValidNames(cut)
    const longest = deriveIdentity('x'.repeat(200))
    expect(longest).toHaveLength(45)
    for (const name of Object.values(resourceNames(longest))) {
      expect(name.split('.')[0]?.length).toBeLessThanOrEqual(63)
    }
    expectValidNames(longest)
  })

  it('C12: two branches that become identical once made valid keep distinct identities', () => {
    expect(deriveIdentity('feature/auth')).not.toBe(deriveIdentity('fix/auth'))
    expect(deriveIdentity('a_b')).not.toBe(deriveIdentity('a-b'))
    expect(deriveIdentity('A-B')).not.toBe(deriveIdentity('a-b'))
  })

  it('C12: no name of one identity is a name of another, the test database and the release key included', () => {
    const allNames = (identity: string) => {
      const names = resourceNames(identity)
      return [...Object.values(names), releaseKeyOf(names.bucket)]
    }
    for (const [a, b] of [
      ['x', 'x-test'],
      ['x', 'x-release'],
      ['a-b', 'a-b-test'],
    ] as const) {
      const theirs = new Set(allNames(b))
      expect(allNames(a).filter((name) => theirs.has(name))).toEqual([])
    }
    expect(deriveIdentity('x--test')).not.toContain('--')
  })

  it('collapses dashes, trims them, and falls back on the hash when nothing is left', () => {
    expect(deriveIdentity('--a//b--')).toMatch(/^a-b-[0-9a-f]{4}$/)
    expect(deriveIdentity('!!!')).toMatch(/^[0-9a-f]{4}$/)
    expectValidNames(deriveIdentity('!!!'))
  })
})
