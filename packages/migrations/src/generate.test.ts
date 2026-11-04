import { describe, expect, it } from 'vitest'
import { lastMigrationModule } from './generate.ts'

describe('generation', () => {
  it('names the last migration, in the order they apply', () => {
    const module = lastMigrationModule({ '0001_a': { up: async () => {} }, '0002_b': { up: async () => {} } })
    expect(module).toContain("export const LAST_MIGRATION = '0002_b'")
  })
})
