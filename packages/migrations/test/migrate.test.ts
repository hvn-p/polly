import { sql } from 'kysely'
import type { Migration } from 'kysely/migration'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { connect, migrate, migrations } from '../src/index.ts'

const db = connect(inject('testDatabaseUrl'))

afterAll(async () => {
  await db.destroy()
})

describe('migrations', () => {
  it('a migration that fails is reported, and applies nothing', async () => {
    const broken: Record<string, Migration> = {
      ...migrations,
      '9997_fixture_broken': {
        up: async () => {
          throw new Error('broken fixture migration')
        },
      },
    }
    await expect(migrate(db, broken)).rejects.toThrow('broken fixture migration')
    const { rows } = await sql<{ count: number }>`
      select count(*)::int as count from kysely_migration where name = '9997_fixture_broken'`.execute(db)
    expect(rows).toEqual([{ count: 0 }])
  })

  it('migrating an up-to-date database changes nothing', async () => {
    await expect(migrate(db)).resolves.toEqual([])
  })
})
