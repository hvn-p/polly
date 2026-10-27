import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { UpOptions } from '../../src/commands/up.ts'
import type { Infrastructure, SupervisorState } from '../../src/infra/ports.ts'

export interface FakeInfrastructure extends Infrastructure {
  calls: string[]
  missingPrerequisite: string | undefined
  routeTable: Map<string, number>
  heldPorts: Map<number, string>
  runningSupervisors: Set<number>
}

// Records every call as `<adapter>.<method> <argument>`, and keeps just
// enough state for the commands to read back what they did.
export function fakeInfrastructure(): FakeInfrastructure {
  const calls: string[] = []
  let nextPid = 90000
  const fake: FakeInfrastructure = {
    calls,
    missingPrerequisite: undefined,
    routeTable: new Map(),
    heldPorts: new Map(),
    runningSupervisors: new Set(),
    realWorkerLock: join(mkdtempSync(join(tmpdir(), 'real-worker-')), 'real-worker.lock'),
    prerequisites: { missing: async () => fake.missingPrerequisite },
    shared: {
      postgresPort: 55432,
      garagePort: 53900,
      ensureRunning: async () => {
        calls.push('shared.ensureRunning')
      },
    },
    postgres: {
      ensure: async ({ names }) => {
        calls.push(`postgres.ensure ${names.role}`)
      },
      release: async (names) => {
        calls.push(`postgres.release ${names.role}`)
      },
    },
    garage: {
      ensure: async ({ bucket }) => {
        calls.push(`garage.ensure ${bucket}`)
      },
      release: async (bucket) => {
        calls.push(`garage.release ${bucket}`)
      },
    },
    routes: {
      portOf: async (name) => fake.routeTable.get(name),
      add: async (name, port) => {
        calls.push(`routes.add ${name} ${port}`)
        fake.routeTable.set(name, port)
      },
      remove: async (name) => {
        calls.push(`routes.remove ${name}`)
        fake.routeTable.delete(name)
      },
    },
    ports: { holderOf: async (port) => fake.heldPorts.get(port) },
    application: {
      migrate: async (env) => {
        calls.push(`application.migrate ${env['DATABASE_URL']?.split('/').pop()}`)
      },
      seed: async (env) => {
        calls.push(`application.seed ${env['POLLY_ENV']}`)
      },
      processes: () => [],
    },
    supervisor: {
      isRunning: (state: SupervisorState) => fake.runningSupervisors.has(state.pid),
      start: async () => {
        const pid = nextPid++
        calls.push('supervisor.start')
        fake.runningSupervisors.add(pid)
        return { pid }
      },
      stop: async (state) => {
        calls.push(`supervisor.stop ${state.pid}`)
        fake.runningSupervisors.delete(state.pid)
      },
    },
  }
  return fake
}

// What dev:up takes from an infrastructure already loaded: its prerequisites,
// and a loader that returns it, recording the load when the infrastructure is
// a recording fake.
export function loaded(
  infra: Infrastructure & { calls?: string[] },
): Pick<UpOptions, 'prerequisites' | 'infrastructure'> {
  return {
    prerequisites: infra.prerequisites,
    infrastructure: async () => {
      infra.calls?.push('infrastructure.load')
      return infra
    },
  }
}
