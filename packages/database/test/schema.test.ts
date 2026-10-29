import { sql } from 'kysely'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { assertSchemaCurrent, connect, SchemaBehind, waitForSchemaCurrent } from '../src/index.ts'

const db = connect(inject('testDatabaseUrl'))

afterAll(async () => {
  await db.destroy()
})

describe('schema check', () => {
  it('the global setup migrated the test database: nothing is pending', async () => {
    await expect(assertSchemaCurrent(db)).resolves.toBeUndefined()
  })

  it('C20: a database behind the code is refused with SCHEMA_BEHIND naming nr dev:up', async () => {
    const refusal = assertSchemaCurrent(db, '9999_fixture_not_applied')
    await expect(refusal).rejects.toBeInstanceOf(SchemaBehind)
    await expect(refusal).rejects.toMatchObject({
      code: 'SCHEMA_BEHIND',
      message: expect.stringMatching(/^SCHEMA_BEHIND: 9999_fixture_not_applied .*nr dev:up/),
    })
  })

  it('C20: a never-migrated database is refused with SCHEMA_BEHIND, not a missing-table error', async () => {
    // An empty schema first on the search path stands for a database no
    // migration ever touched.
    await sql`create schema if not exists never_migrated`.execute(db)
    const url = new URL(inject('testDatabaseUrl'))
    url.searchParams.set('options', '-c search_path=never_migrated')
    const empty = connect(url.toString())
    try {
      await expect(assertSchemaCurrent(empty)).rejects.toBeInstanceOf(SchemaBehind)
    } finally {
      await empty.destroy()
      await sql`drop schema never_migrated`.execute(db)
    }
  })
})

describe('waiting for the schema', () => {
  it('C20: waits while the database is behind, reporting it once, then returns once it matches the code', async () => {
    const behind: string[] = []
    // The fixture's expectation goes once "dev:up has migrated": the check then
    // matches, with no write to the shared test database.
    const options: Parameters<typeof waitForSchemaCurrent>[1] = {
      last: '9998_fixture_migrated_later',
      retryMs: 20,
      onBehind: (message) => behind.push(message),
    }
    let done = false
    const waiting = waitForSchemaCurrent(db, options).then(() => {
      done = true
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(done).toBe(false)
    expect(behind).toEqual([expect.stringMatching(/^SCHEMA_BEHIND: 9998_fixture_migrated_later/)])
    delete options.last
    await waiting
    expect(behind).toHaveLength(1)
  })
})
