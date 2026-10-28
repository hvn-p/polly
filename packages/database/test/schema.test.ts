import { afterAll, describe, expect, inject, it } from 'vitest'
import { assertSchemaCurrent, connect, SchemaBehind } from '../src/index.ts'

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
})
