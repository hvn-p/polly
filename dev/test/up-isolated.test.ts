import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { up } from '../src/commands/up.ts'
import { loaded } from './support/fake-infrastructure.ts'
import { containerIds, isolatedInfrastructure } from './support/isolated-infrastructure.ts'
import {
  envOf,
  garage as garageOf,
  isolatedWorktreeInfrastructure,
  query,
  routeTable,
  shippedMigrations,
  stateOf,
  superuser as superuserOf,
  testProcesses,
} from './support/isolated-worktree.ts'
import { temporaryRepository } from './support/repository.ts'

let shared: Awaited<ReturnType<typeof isolatedInfrastructure>>
const processes = testProcesses()

beforeAll(async () => {
  shared = await isolatedInfrastructure()
})

afterAll(async () => {
  await processes.removeAll()
  shared.destroy()
})

function infrastructure() {
  return isolatedWorktreeInfrastructure(shared, processes)
}

// Whether every process of the worktree's project runs, healthy.
function running(root: string): Promise<boolean> {
  return processes.isRunning(processes.projectOf(envOf(root)['POLLY_WORKTREE_ID'] ?? '', root))
}

const superuser = (sql: string) => superuserOf(shared, sql)
const garage = (endpoint: string, payload: object) => garageOf(shared, endpoint, payload)

const out = () => undefined

describe('dev:up against an isolated infrastructure', { timeout: 240_000 }, () => {
  const root = temporaryRepository('feature/isolated')

  it('C1: on a fresh worktree with the infrastructure stopped, creates and starts everything', async () => {
    await up({ root, ...loaded(infrastructure()), out, warn: out })
    const env = envOf(root)
    const database = env['DATABASE_URL']?.split('/').pop() ?? ''
    const testDatabase = env['TEST_DATABASE_URL']?.split('/').pop() ?? ''
    expect(
      await superuser(`select count(*) from pg_database where datname in ('${database}', '${testDatabase}')`),
    ).toBe('2')
    expect(await garage('GetBucketInfo', { globalAlias: env['S3_BUCKET'] })).toMatchObject({
      globalAliases: [env['S3_BUCKET']],
    })
    expect(await garage('GetKeyInfo', { id: env['S3_ACCESS_KEY_ID'] })).toMatchObject({
      name: env['S3_BUCKET'],
    })
    expect(await query(root, 'select name from kysely_migration order by name')).toEqual(
      await shippedMigrations(),
    )
    expect(await query(root, 'select email from "user"')).toEqual([{ email: 'demo@polly.localhost' }])
    const id = env['POLLY_WORKTREE_ID'] ?? ''
    expect(routeTable.get(`${id}.polly`)).toBe(Number(env['POLLY_WEB_PORT']))
    expect(routeTable.get(`arch.${id}.polly`)).toBe(Number(env['POLLY_ARCH_PORT']))
    expect(await running(root)).toBe(true)
  })

  it('C2: again on the running worktree, recreates nothing', async () => {
    const env = envOf(root)
    const database = env['DATABASE_URL']?.split('/').pop() ?? ''
    const before = {
      database: await superuser(`select oid from pg_database where datname = '${database}'`),
      bucket: (await garage('GetBucketInfo', { globalAlias: env['S3_BUCKET'] }))['created'],
      key: (await garage('GetKeyInfo', { id: env['S3_ACCESS_KEY_ID'] }))['created'],
      processes: containerIds(stateOf(root).project),
      containers: containerIds(shared.project),
    }
    await up({ root, ...loaded(infrastructure()), out, warn: out })
    expect({
      database: await superuser(`select oid from pg_database where datname = '${database}'`),
      bucket: (await garage('GetBucketInfo', { globalAlias: env['S3_BUCKET'] }))['created'],
      key: (await garage('GetKeyInfo', { id: env['S3_ACCESS_KEY_ID'] }))['created'],
      processes: containerIds(stateOf(root).project),
      containers: containerIds(shared.project),
    }).toEqual(before)
  })

  it('C3: brings back processes whose containers were removed, and keeps the data', async () => {
    await query(root, 'create table kept (value text); insert into kept values ($$row$$)')
    const { project } = stateOf(root)
    execFileSync('docker', ['rm', '--force', ...containerIds(project).split(',')], { stdio: 'ignore' })
    expect(await running(root)).toBe(false)
    await up({ root, ...loaded(infrastructure()), out, warn: out })
    expect(await running(root)).toBe(true)
    expect(await query(root, 'select value from kept')).toEqual([{ value: 'row' }])
  })

  it('C4: applies a pending migration and keeps the data', async () => {
    // The latest migration made pending again, as code bringing a new one would.
    const [latest] = (await shippedMigrations()).slice(-1)
    await query(
      root,
      `drop table agent_event_code; delete from kysely_migration where name = '${latest?.name}'`,
    )
    await up({ root, ...loaded(infrastructure()), out, warn: out })
    expect(await query(root, 'select name from kysely_migration order by name')).toEqual(
      await shippedMigrations(),
    )
    expect(await query(root, 'select count(*)::int as rows from agent_event_code')).toEqual([{ rows: 0 }])
    expect(await query(root, 'select value from kept')).toEqual([{ value: 'row' }])
  })

  it('C8: three worktrees at once, infrastructure stopped: one infrastructure, three worktrees running', async () => {
    execFileSync('docker', ['compose', '-p', shared.project, 'stop'], { stdio: 'ignore' })
    const roots = ['feature/one', 'feature/two', 'feature/three'].map((branch) => temporaryRepository(branch))
    await Promise.all(roots.map((each) => up({ root: each, ...loaded(infrastructure()), out, warn: out })))
    expect(containerIds(shared.project).split(',')).toHaveLength(2)
    for (const each of roots) {
      expect(await running(each)).toBe(true)
      expect(await query(each, 'select name from kysely_migration order by name')).toEqual(
        await shippedMigrations(),
      )
    }
  })
})
