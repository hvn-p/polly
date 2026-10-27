import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { postgresAdmin } from '../src/infra/postgres.ts'
import type { DatabaseAccess } from '../src/ports/index.ts'
import { isolatedInfrastructure } from './support/isolated-infrastructure.ts'

let infra: Awaited<ReturnType<typeof isolatedInfrastructure>>

beforeAll(async () => {
  infra = await isolatedInfrastructure()
  await infra.ensureRunning()
}, 180_000)

afterAll(() => {
  infra.destroy()
})

function access(name: string): DatabaseAccess {
  return {
    names: { role: `polly_${name}`, database: `polly_${name}`, testDatabase: `polly_${name}_test` },
    password: `pw${name}`.padEnd(48, '0'),
  }
}

async function connect({ names, password }: DatabaseAccess, database: string): Promise<pg.Client> {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: infra.postgresPort,
    user: names.role,
    password,
    database,
  })
  await client.connect()
  return client
}

async function superuser(sql: string): Promise<string> {
  return (await infra.exec('postgres', ['psql', '-U', 'postgres', '-tAc', sql])).trim()
}

describe('Postgres adapter', { timeout: 60_000 }, () => {
  const admin = () => postgresAdmin(infra)

  it('C59: the role owns both databases, is not a superuser, and reaches no other worktree', async () => {
    const a = access('a')
    const b = access('b')
    await admin().ensure(a, ['pg_trgm'])
    await admin().ensure(b, [])
    expect(await superuser(`select rolsuper from pg_roles where rolname = 'polly_a'`)).toBe('f')
    expect(
      await superuser(
        `select string_agg(datname || '=' || pg_get_userbyid(datdba), ',' order by datname) from pg_database where datname like 'polly_a%'`,
      ),
    ).toBe('polly_a=polly_a,polly_a_test=polly_a')
    const client = await connect(a, 'polly_a_test')
    const { rows } = await client.query<{ extname: string }>(
      `select extname from pg_extension where extname = 'pg_trgm'`,
    )
    expect(rows).toHaveLength(1)
    await client.end()
    await expect(connect(a, 'polly_b')).rejects.toThrow(/permission denied/)
  })

  it('creating again changes nothing', async () => {
    const a = access('a')
    const oid = await superuser(`select oid from pg_database where datname = 'polly_a'`)
    await admin().ensure(a, ['pg_trgm'])
    expect(await superuser(`select oid from pg_database where datname = 'polly_a'`)).toBe(oid)
  })

  it('C15: releases the databases while a connection is open, then the role; again changes nothing', async () => {
    const c = access('c')
    await admin().ensure(c, [])
    const client = await connect(c, 'polly_c')
    client.on('error', () => undefined)
    await admin().release(c.names)
    expect(await superuser(`select count(*) from pg_database where datname like 'polly_c%'`)).toBe('0')
    expect(await superuser(`select count(*) from pg_roles where rolname = 'polly_c'`)).toBe('0')
    await expect(admin().release(c.names)).resolves.toBeUndefined()
    await client.end().catch(() => undefined)
  })

  it('refuses a name that is not a plain identifier', async () => {
    const bad = { ...access('d'), names: { role: 'x; drop', database: 'x', testDatabase: 'x_test' } }
    await expect(admin().ensure(bad, [])).rejects.toThrow(/identifier/)
  })
})
