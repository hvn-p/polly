import { assertSchemaCurrent, connect, type Database } from '@polly/database'
import { identityOptions } from '@polly/identity'
import { getMigrations as getAuthMigrations } from 'better-auth/db/migration'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { startServer, startWhenSchemaCurrent } from '../src/entry/main.ts'
import { testConfig } from './support/config.ts'

const db: Database = connect(inject('testDatabaseUrl'))

afterAll(async () => {
  await db.destroy()
})

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
    await expect(
      startServer({ config, hostname: '127.0.0.1', port: 0, lastMigration: '9999_fixture_not_applied' }),
    ).rejects.toThrow(/SCHEMA_BEHIND/)
  })
})

describe('waiting for the schema', () => {
  it('C20: refuses to serve while the database is behind, then serves once it matches the code', async () => {
    const behind: string[] = []
    // The fixture's expectation goes once "dev:up has migrated": the server's
    // view of the schema then matches, with no write to the shared test database.
    const options: Parameters<typeof startWhenSchemaCurrent>[0] = {
      config: testConfig(),
      hostname: '127.0.0.1',
      port: 0,
      lastMigration: '9998_fixture_migrated_later',
      retryMs: 20,
      onBehind: (message) => behind.push(message),
    }
    const starting = startWhenSchemaCurrent(options)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(behind).toEqual([expect.stringMatching(/^SCHEMA_BEHIND: 9998_fixture_migrated_later/)])
    delete options.lastMigration
    const server = await starting
    expect((await fetch(`${server.url}/.well-known/oauth-protected-resource/mcp`)).status).toBe(200)
    await server.close()
  })
})
