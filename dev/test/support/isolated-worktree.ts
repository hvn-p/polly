import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { parseEnv } from '../../src/config/index.ts'
import { garageAdmin } from '../../src/infra/garage.ts'
import { listeningPorts } from '../../src/infra/listening.ts'
import { postgresAdmin } from '../../src/infra/postgres.ts'
import type { Infrastructure } from '../../src/ports/index.ts'
import { apiApplication } from '../../src/real.ts'
import { processSupervisor } from '../../src/supervisor/index.ts'
import { fakeInfrastructure } from './fake-infrastructure.ts'
import type { isolatedInfrastructure } from './isolated-infrastructure.ts'

type Shared = Awaited<ReturnType<typeof isolatedInfrastructure>>

// portless is absent from CI: the route table is the fake's, one for every
// infrastructure of a test file, as portless's is one for the machine.
const routes = fakeInfrastructure()
export const routeTable = routes.routeTable

// The real adapters on an isolated infrastructure, the route table above and
// stand-in processes. Every supervisor started is recorded, to be stopped
// after the tests.
export function isolatedWorktreeInfrastructure(shared: Shared, supervisors: number[]): Infrastructure {
  const fake = fakeInfrastructure()
  const supervisor = processSupervisor()
  return {
    ...fake,
    routes: routes.routes,
    prerequisites: { missing: async () => undefined },
    shared,
    postgres: postgresAdmin(shared),
    garage: garageAdmin(shared),
    ports: listeningPorts(),
    application: {
      ...apiApplication(),
      processes: () => [
        { name: 'api', command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: '/' },
      ],
    },
    supervisor: {
      ...supervisor,
      start: async (options) => {
        const state = await supervisor.start(options)
        supervisors.push(state.pid)
        return state
      },
    },
  }
}

export function envOf(root: string): Record<string, string> {
  return Object.fromEntries(parseEnv(readFileSync(join(root, '.env.local'), 'utf8')))
}

export function stateOf(root: string): { supervisor: { pid: number } } {
  return JSON.parse(readFileSync(join(root, '.dev/state.json'), 'utf8')) as { supervisor: { pid: number } }
}

export async function query(root: string, sql: string): Promise<Record<string, unknown>[]> {
  const client = new pg.Client({ connectionString: envOf(root)['DATABASE_URL'] })
  await client.connect()
  try {
    return (await client.query(sql)).rows as Record<string, unknown>[]
  } finally {
    await client.end()
  }
}

export async function superuser(shared: Shared, sql: string): Promise<string> {
  return (await shared.exec('postgres', ['psql', '-U', 'postgres', '-tAc', sql])).trim()
}

export async function garage(
  shared: Shared,
  endpoint: string,
  payload: object,
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await shared.exec('garage', ['/garage', 'json-api', endpoint, '-'], JSON.stringify(payload)),
  ) as Record<string, unknown>
}

// The shipped migrations, as a migrated database lists them.
export async function shippedMigrations(): Promise<{ name: string }[]> {
  const { migrations } = await import('@polly/migrations')
  return Object.keys(migrations).map((name) => ({ name }))
}
