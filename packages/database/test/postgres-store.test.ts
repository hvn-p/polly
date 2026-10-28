import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { connect, PostgresStore } from '../src/index.ts'

const db = connect(inject('testDatabaseUrl'))
const store = new PostgresStore(db)

async function learner(id: string): Promise<void> {
  await sql`insert into "user" (id, name, email, "emailVerified", "updatedAt")
    values (${id}, ${id}, ${`${id}@store.test`}, true, now()) on conflict do nothing`.execute(db)
}

beforeAll(async () => {
  await learner('store-a')
  await learner('store-b')
})

afterAll(async () => {
  await sql`delete from "user" where email like '%@store.test'`.execute(db)
  await db.destroy()
})

describe('PostgresStore, event codes', () => {
  it('records a code once, for the first learner', async () => {
    await store.insertIfAbsent('hash-1', 'store-a')
    await store.insertIfAbsent('hash-1', 'store-b')
    expect(await store.find('hash-1')).toEqual({ learnerId: 'store-a', revoked: false })
    const { rows } = await sql<{
      n: number
    }>`select count(*)::int as n from agent_event_code where code_hash = 'hash-1'`.execute(db)
    expect(rows).toEqual([{ n: 1 }])
  })

  it('reads a revoked code as revoked, and an unknown one as nothing', async () => {
    await store.insertIfAbsent('hash-2', 'store-a')
    await sql`update agent_event_code set revoked_at = now() where code_hash = 'hash-2'`.execute(db)
    expect(await store.find('hash-2')).toEqual({ learnerId: 'store-a', revoked: true })
    expect(await store.find('hash-unknown')).toBeUndefined()
  })
})
