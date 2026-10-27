import { execFileSync } from 'node:child_process'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { down } from '../src/commands/down.ts'
import { up } from '../src/commands/up.ts'
import { groupMembers, processSupervisor } from '../src/supervisor/index.ts'
import { isolatedInfrastructure } from './support/isolated-infrastructure.ts'
import {
  envOf,
  garage as garageOf,
  isolatedWorktreeInfrastructure,
  query,
  stateOf,
  superuser as superuserOf,
} from './support/isolated-worktree.ts'
import { temporaryRepository } from './support/repository.ts'
import { until } from './support/until.ts'

let shared: Awaited<ReturnType<typeof isolatedInfrastructure>>
const supervisors: number[] = []

beforeAll(async () => {
  shared = await isolatedInfrastructure()
})

afterAll(async () => {
  for (const pid of supervisors) {
    await processSupervisor().stop({ pid })
  }
  shared.destroy()
})

const infrastructure = () => isolatedWorktreeInfrastructure(shared, supervisors)
const superuser = (sql: string) => superuserOf(shared, sql)
const out = () => undefined

async function released(env: Record<string, string>): Promise<void> {
  const database = env['DATABASE_URL']?.split('/').pop() ?? ''
  expect(await superuser(`select count(*) from pg_database where datname like '${database}%'`)).toBe('0')
  expect(await superuser(`select count(*) from pg_roles where rolname = '${database}'`)).toBe('0')
  await expect(garageOf(shared, 'GetBucketInfo', { globalAlias: env['S3_BUCKET'] })).rejects.toThrow(
    /NoSuchBucket/,
  )
  await expect(garageOf(shared, 'GetKeyInfo', { id: env['S3_ACCESS_KEY_ID'] })).rejects.toThrow(
    /NoSuchAccessKey/,
  )
}

describe('dev:down against an isolated infrastructure', { timeout: 240_000 }, () => {
  it('C15, C16: with processes running and a connection open, releases everything; again changes nothing', async () => {
    const root = temporaryRepository('feature/release')
    const infra = infrastructure()
    await up({ root, infra, out })
    const pid = stateOf(root).supervisor.pid
    await until(() => groupMembers(pid).length === 2)
    const client = new pg.Client({ connectionString: envOf(root)['DATABASE_URL'] })
    client.on('error', () => undefined)
    await client.connect()
    const env = envOf(root)
    await down({ root, infra, out })
    expect(groupMembers(pid)).toEqual([])
    await released(env)
    await expect(down({ root, infra, out })).resolves.toBeUndefined()
    await client.end().catch(() => undefined)
  })

  it('C17: with the infrastructure stopped, starts it, then releases', async () => {
    const root = temporaryRepository('feature/stopped')
    const infra = infrastructure()
    await up({ root, infra, out })
    execFileSync('docker', ['compose', '-p', shared.project, 'stop'], { stdio: 'ignore' })
    const env = envOf(root)
    await down({ root, infra, out })
    await released(env)
  })

  it('C18: in worktree A, leaves B running with its data, and C19: a reset gives A back its initial state', async () => {
    const a = temporaryRepository('feature/a')
    const b = temporaryRepository('feature/b')
    const infra = infrastructure()
    await up({ root: a, infra, out })
    await up({ root: b, infra, out })
    await query(a, 'create table mine (value text)')
    await query(b, `create table mine (value text); insert into mine values ('b')`)
    const bSupervisor = stateOf(b).supervisor.pid
    await down({ root: a, infra, out })
    await until(() => groupMembers(bSupervisor).length === 2)
    expect(await query(b, 'select value from mine')).toEqual([{ value: 'b' }])
    expect(await garageOf(shared, 'GetBucketInfo', { globalAlias: envOf(b)['S3_BUCKET'] })).toBeDefined()

    await up({ root: a, infra, out })
    expect(
      await query(
        a,
        `select count(*)::int as tables from information_schema.tables where table_name = 'mine'`,
      ),
    ).toEqual([{ tables: 0 }])
    expect(await query(a, 'select name from kysely_migration')).toEqual([{ name: '0001_auth' }])
    expect(await query(a, 'select email from "user"')).toEqual([{ email: 'demo@polly.localhost' }])
  })
})
