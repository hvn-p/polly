import { assertSchemaCurrent, connect, type Database } from '@polly/database'
import { identityOptions } from '@polly/identity'
import { getMigrations as getAuthMigrations } from 'better-auth/db/migration'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { startServer } from '../src/main.ts'
import { testConfig } from './support/config.ts'
import { captureLog } from './support/log.ts'

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
      startServer({
        config,
        hostname: '127.0.0.1',
        port: 0,
        lastMigration: '9999_fixture_not_applied',
        log: captureLog().log,
      }),
    ).rejects.toThrow(/SCHEMA_BEHIND/)
  })
})
