import { assertSchemaCurrent, migrations } from '@polly/database'
import { getMigrations as getAuthMigrations } from 'better-auth/db/migration'
import { type Kysely, sql } from 'kysely'
import type { Migration } from 'kysely/migration'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { createDatabase, type Database } from '../src/entry/database.ts'
import { startServer, startWhenSchemaCurrent } from '../src/entry/server.ts'
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

  it('C20: the server does not start, and serves no route, against a database behind the code', async () => {
    const config = testConfig()
    await expect(startServer({ config, port: 0, migrations: { ...migrations, ...fixture } })).rejects.toThrow(
      /SCHEMA_BEHIND/,
    )
  })
})

describe('waiting for the schema', () => {
  it('C20: refuses to serve while the database is behind, then serves once it matches the code', async () => {
    const behind: string[] = []
    // The fixture leaves the set once "dev:up has migrated": the server's view
    // of the schema then matches, with no write to the shared test database.
    const pending: Record<string, Migration> = {
      ...migrations,
      '9998_fixture_migrated_later': { up: async () => undefined },
    }
    const starting = startWhenSchemaCurrent({
      config: testConfig(),
      port: 0,
      migrations: pending,
      retryMs: 20,
      onBehind: (message) => behind.push(message),
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(behind).toEqual([expect.stringMatching(/^SCHEMA_BEHIND: 9998_fixture_migrated_later/)])
    delete pending['9998_fixture_migrated_later']
    const server = await starting
    expect((await fetch(`${server.url}/.well-known/oauth-protected-resource/mcp`)).status).toBe(200)
    await server.close()
  })
})
