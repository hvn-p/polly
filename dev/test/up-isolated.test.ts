import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { up } from '../src/commands/up.ts'
import { groupMembers, processSupervisor } from '../src/supervisor/index.ts'
import { containerIds, isolatedInfrastructure } from './support/isolated-infrastructure.ts'
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

function infrastructure() {
  return isolatedWorktreeInfrastructure(shared, supervisors)
}

const superuser = (sql: string) => superuserOf(shared, sql)
const garage = (endpoint: string, payload: object) => garageOf(shared, endpoint, payload)

const out = () => undefined

describe('dev:up against an isolated infrastructure', { timeout: 240_000 }, () => {
  const root = temporaryRepository('feature/isolated')

  it('C1: on a fresh worktree with the infrastructure stopped, creates and starts everything', async () => {
    await up({ root, infra: infrastructure(), out })
    const env = envOf(root)
    const database = env['DATABASE_URL']?.split('/').pop() ?? ''
    expect(
      await superuser(
        `select count(*) from pg_database where datname in ('${database}', '${database}_test')`,
      ),
    ).toBe('2')
    expect(await garage('GetBucketInfo', { globalAlias: env['S3_BUCKET'] })).toMatchObject({
      globalAliases: [env['S3_BUCKET']],
    })
    expect(await garage('GetKeyInfo', { id: env['S3_ACCESS_KEY_ID'] })).toMatchObject({
      name: env['S3_BUCKET'],
    })
    expect(await query(root, 'select name from kysely_migration')).toEqual([{ name: '0001_auth' }])
    expect(await query(root, 'select email from "user"')).toEqual([{ email: 'demo@polly.localhost' }])
    await until(() => groupMembers(stateOf(root).supervisor.pid).length === 2)
  })

  it('C2: again on the running worktree, recreates nothing', async () => {
    const env = envOf(root)
    const database = env['DATABASE_URL']?.split('/').pop() ?? ''
    const before = {
      database: await superuser(`select oid from pg_database where datname = '${database}'`),
      bucket: (await garage('GetBucketInfo', { globalAlias: env['S3_BUCKET'] }))['created'],
      key: (await garage('GetKeyInfo', { id: env['S3_ACCESS_KEY_ID'] }))['created'],
      supervisor: stateOf(root).supervisor.pid,
      containers: containerIds(shared.project),
    }
    await up({ root, infra: infrastructure(), out })
    expect({
      database: await superuser(`select oid from pg_database where datname = '${database}'`),
      bucket: (await garage('GetBucketInfo', { globalAlias: env['S3_BUCKET'] }))['created'],
      key: (await garage('GetKeyInfo', { id: env['S3_ACCESS_KEY_ID'] }))['created'],
      supervisor: stateOf(root).supervisor.pid,
      containers: containerIds(shared.project),
    }).toEqual(before)
  })

  it('C3: brings stopped processes back and keeps the data', async () => {
    await query(root, 'create table kept (value text); insert into kept values ($$row$$)')
    const killed = stateOf(root).supervisor.pid
    process.kill(-killed, 'SIGKILL')
    await up({ root, infra: infrastructure(), out })
    expect(stateOf(root).supervisor.pid).not.toBe(killed)
    await until(() => groupMembers(stateOf(root).supervisor.pid).length === 2)
    expect(await query(root, 'select value from kept')).toEqual([{ value: 'row' }])
  })

  it('C4: applies a pending migration and keeps the data', async () => {
    // The auth migration made pending again, as code bringing a new one would.
    await query(
      root,
      `drop table "oauthClientAssertion"; delete from kysely_migration where name = '0001_auth'`,
    )
    await query(
      root,
      'drop table "oauthConsent", "oauthAccessToken", "oauthRefreshToken", "oauthClientResource", "oauthResource", "oauthClient", "jwks", "verification", "account", "session", "user"',
    )
    await up({ root, infra: infrastructure(), out })
    expect(await query(root, 'select name from kysely_migration')).toEqual([{ name: '0001_auth' }])
    expect(await query(root, 'select value from kept')).toEqual([{ value: 'row' }])
  })

  it('C8: three worktrees at once, infrastructure stopped: one infrastructure, three worktrees running', async () => {
    execFileSync('docker', ['compose', '-p', shared.project, 'stop'], { stdio: 'ignore' })
    const roots = ['feature/one', 'feature/two', 'feature/three'].map((branch) => temporaryRepository(branch))
    await Promise.all(roots.map((each) => up({ root: each, infra: infrastructure(), out })))
    expect(containerIds(shared.project).split(',')).toHaveLength(2)
    for (const each of roots) {
      await until(() => groupMembers(stateOf(each).supervisor.pid).length === 2)
      expect(await query(each, 'select name from kysely_migration')).toEqual([{ name: '0001_auth' }])
    }
  })
})
