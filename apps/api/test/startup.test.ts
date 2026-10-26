import { getMigrations as getAuthMigrations } from 'better-auth/db/migration'
import { type Kysely, sql } from 'kysely'
import type { Migration } from 'kysely/migration'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { createDatabase, type Database } from '../src/entry/database.ts'
import { startServer } from '../src/entry/server.ts'
import { assertSchemaCurrent, migrate } from '../src/entry/startup.ts'
import { migrations } from '../src/migrations/index.ts'
import { identityOptions } from '../src/reference/identity/index.ts'
import { testConfig } from './support/config.ts'

const db: Kysely<Database> = createDatabase(inject('testDatabaseUrl'))

afterAll(async () => {
  await db.destroy()
})

const fixture: Record<string, Migration> = {
  '9999_fixture_not_applied': {
    up: async (fixtureDb) => {
      await sql`select 1`.execute(fixtureDb)
    },
  },
}

describe('migrations and schema check', () => {
  it('the global setup migrated the test database: nothing is pending', async () => {
    await expect(assertSchemaCurrent(db)).resolves.toBeUndefined()
  })

  it('the first migration holds every table Better Auth lists for its plugins', async () => {
    const options = identityOptions({
      publicUrl: 'https://x.polly.localhost',
      secret: 'x'.repeat(32),
      db,
      fetchClientMetadataResource: async () => {
        throw new Error('no network in tests')
      },
    })
    const plan = await getAuthMigrations(options)
    expect(plan.toBeCreated.map(({ table }) => table)).toEqual([])
    expect(plan.toBeAdded.map(({ table }) => table)).toEqual([])
  })

  it('migrating an up-to-date database changes nothing', async () => {
    await expect(migrate(db)).resolves.toEqual([])
  })

  it('C20: a database behind the code is refused with SCHEMA_BEHIND naming nr dev:up', async () => {
    await expect(assertSchemaCurrent(db, { ...migrations, ...fixture })).rejects.toThrow(
      /^SCHEMA_BEHIND: 9999_fixture_not_applied .*nr dev:up/,
    )
  })

  it('C20: the server does not start, and serves no route, against a database behind the code', async () => {
    const config = testConfig()
    await expect(startServer({ config, port: 0, migrations: { ...migrations, ...fixture } })).rejects.toThrow(
      /SCHEMA_BEHIND/,
    )
  })
})
