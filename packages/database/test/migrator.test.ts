import { sql } from 'kysely'
import type { Migration } from 'kysely/migration'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { assertSchemaCurrent, connect, migrate, migrations, SchemaBehind } from '../src/index.ts'

const db = connect(inject('testDatabaseUrl'))

afterAll(async () => {
  await db.destroy()
})

describe('migrations and schema check', () => {
  it('the global setup migrated the test database: nothing is pending', async () => {
    await expect(assertSchemaCurrent(db)).resolves.toBeUndefined()
  })

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

  it('C20: a database behind the code is refused with SCHEMA_BEHIND naming nr dev:up', async () => {
    const fixture: Record<string, Migration> = { '9999_fixture_not_applied': { up: async () => undefined } }
    const refusal = assertSchemaCurrent(db, { ...migrations, ...fixture })
    await expect(refusal).rejects.toBeInstanceOf(SchemaBehind)
    await expect(refusal).rejects.toMatchObject({
      code: 'SCHEMA_BEHIND',
      message: expect.stringMatching(/^SCHEMA_BEHIND: 9999_fixture_not_applied .*nr dev:up/),
    })
  })
})
