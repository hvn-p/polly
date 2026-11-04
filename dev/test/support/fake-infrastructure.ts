import { Refusal } from '@polly/platform'
import type { UpOptions } from '../../src/commands/up.ts'
import type { ComputeServices, Infrastructure } from '../../src/ports/index.ts'

export interface FakeInfrastructure extends Infrastructure {
  compute: FakeCompute
  calls: string[]
  missingPrerequisite: string | undefined
  routeTable: Map<string, number>
  heldPorts: Set<number>
  // The worktree projects whose every process runs.
  runningProjects: Set<string>
  // Whether the architecture view's source holds a view.
  viewAvailable: boolean
}

export interface FakeCompute extends ComputeServices {
  calls: string[]
  // The fingerprint of each worktree's sources; fp-main when not set.
  fingerprints: Map<string, string>
  // The worktrees using each running service.
  users: Map<string, Set<string>>
  images: Set<string>
  urlOf: (fingerprint: string) => string
}

// The machine's compute services, shared by the worktrees a test gives it to.
export function fakeCompute(): FakeCompute {
  const fake: FakeCompute = {
    calls: [],
    fingerprints: new Map(),
    users: new Map(),
    images: new Set(),
    urlOf: (fingerprint) => `http://127.0.0.1:8000/${fingerprint}`,
    fingerprintOf: async (root) => fake.fingerprints.get(root) ?? 'fp-main',
    use: async (fingerprint, identity, sources) => {
      const running = fake.users.get(fingerprint)
      const users = running ?? new Set<string>()
      if (running === undefined) {
        if (sources === undefined && !fake.images.has(fingerprint)) {
          throw new Refusal('UNKNOWN_COMPUTE_VERSION', `no image of the compute service ${fingerprint}`)
        }
        fake.calls.push(`compute.start ${fingerprint}`)
        fake.images.add(fingerprint)
        fake.users.set(fingerprint, users)
      }
      users.add(identity)
      return {
        url: fake.urlOf(fingerprint),
        started: running === undefined,
        others: [...fake.users.keys()].filter((other) => other !== fingerprint),
      }
    },
    release: async (fingerprint, identity) => {
      const users = fake.users.get(fingerprint)
      users?.delete(identity)
      if (users?.size === 0) {
        fake.calls.push(`compute.stop ${fingerprint}`)
        fake.users.delete(fingerprint)
      }
    },
  }
  return fake
}

// Records every call as `<adapter>.<method> <argument>`, and keeps just
// enough state for the commands to read back what they did.
export function fakeInfrastructure(): FakeInfrastructure {
  const calls: string[] = []
  const fake: FakeInfrastructure = {
    calls,
    missingPrerequisite: undefined,
    routeTable: new Map(),
    heldPorts: new Set(),
    runningProjects: new Set(),
    viewAvailable: true,
    compute: fakeCompute(),
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
    ports: { isHeld: async (port) => fake.heldPorts.has(port) },
    application: {
      migrate: async (env) => {
        calls.push(`application.migrate ${env['DATABASE_URL']?.split('/').pop()}`)
      },
      seed: async (env) => {
        calls.push(`application.seed ${env['POLLY_ENV']}`)
      },
    },
    architecture: {
      projectOf: (identity) => `polly-${identity}-architecture`,
      start: async (name, { from }) => {
        calls.push(`architecture.start ${name} ${from}`)
        return fake.viewAvailable ? 'served' : 'unavailable'
      },
      stop: async (name) => {
        calls.push(`architecture.stop ${name}`)
      },
    },
    processes: {
      projectOf: (identity, root) => ({ name: `polly-${identity}`, identity, root }),
      start: async ({ name }) => {
        calls.push(`processes.start ${name}`)
        fake.runningProjects.add(name)
      },
      isRunning: async ({ name }) => fake.runningProjects.has(name),
      restart: async ({ name }, process) => {
        calls.push(`processes.restart ${name} ${process}`)
      },
      stop: async (name) => {
        calls.push(`processes.stop ${name}`)
        fake.runningProjects.delete(name)
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
