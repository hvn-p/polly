import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { parseEnv } from '../../src/config/index.ts'
import { garageAdmin } from '../../src/infra/garage.ts'
import { listeningPorts } from '../../src/infra/listening.ts'
import { postgresAdmin } from '../../src/infra/postgres.ts'
import { composeProcesses } from '../../src/infra/processes.ts'
import type { Infrastructure } from '../../src/ports/index.ts'
import { apiApplication } from '../../src/real.ts'
import { fakeInfrastructure } from './fake-infrastructure.ts'
import type { isolatedInfrastructure } from './isolated-infrastructure.ts'

type Shared = Awaited<ReturnType<typeof isolatedInfrastructure>>

// portless is absent from CI: the route table is the fake's, one for every
// infrastructure of a test file, as portless's is one for the machine.
const routes = fakeInfrastructure()
export const routeTable = routes.routeTable

// The checkout the worktree processes run from: this one's builds.
const codeRoot = join(import.meta.dirname, '..', '..', '..')

// The worktree projects of a test file: named apart from any worktree of the
// machine, and from another run's.
export function testProcesses() {
  const processes = composeProcesses({
    codeRoot,
    prefix: `polly-test-${randomBytes(3).toString('hex')}-`,
  })
  const started = new Set<string>()
  return {
    ...processes,
    start: async (project: Parameters<typeof processes.start>[0]) => {
      started.add(project.name)
      await processes.start(project)
    },
    // Removes every project the tests started.
    removeAll: async () => {
      for (const name of started) {
        await processes.stop(name)
      }
    },
  }
}

// The real adapters on an isolated infrastructure, the route table above, and
// the worktree's real processes.
export function isolatedWorktreeInfrastructure(
  shared: Shared,
  processes: ReturnType<typeof testProcesses>,
): Infrastructure {
  const fake = fakeInfrastructure()
  return {
    ...fake,
    routes: routes.routes,
    prerequisites: { missing: async () => undefined },
    shared,
    postgres: postgresAdmin(shared),
    garage: garageAdmin(shared),
    ports: listeningPorts(),
    application: apiApplication(),
    processes,
  }
}

export function envOf(root: string): Record<string, string> {
  return Object.fromEntries(parseEnv(readFileSync(join(root, '.env.local'), 'utf8')))
}

export function stateOf(root: string): { project: string } {
  return JSON.parse(readFileSync(join(root, '.dev/state.json'), 'utf8')) as { project: string }
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
