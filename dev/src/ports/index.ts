// What the dev commands need from the machine, as ports: the commands are
// tested with recording fakes of them, and with the real adapters against an
// isolated infrastructure.

import type { ResourceNames } from '../identity/index.ts'

export interface Prerequisites {
  // The first missing prerequisite, by name, or undefined when all are present.
  missing: () => Promise<string | undefined>
}

export interface SharedInfrastructure {
  // The loopback ports Postgres and Garage's S3 API are published on.
  postgresPort: number
  garagePort: number
  // Starts Postgres and Garage when they are not running; never stops them.
  ensureRunning: () => Promise<void>
}

export interface DatabaseAccess {
  names: Pick<ResourceNames, 'role' | 'database' | 'testDatabase'>
  password: string
}

export interface PostgresAdmin {
  // Creates what is missing: the role, the database, the test database, the
  // extensions. Changes nothing that exists.
  ensure: (access: DatabaseAccess, extensions: readonly string[]) => Promise<void>
  // Drops the databases, closing their connections, then the role. What is
  // already gone is skipped.
  release: (names: DatabaseAccess['names']) => Promise<void>
}

export interface BucketAccess {
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export interface GarageAdmin {
  // Creates what is missing: the bucket with its expiration rule, the key,
  // its read and write (never owner) permission.
  ensure: (access: BucketAccess, expirationDays: number) => Promise<void>
  // Empties and deletes the bucket, deletes the keys named after it. What is
  // already gone is skipped.
  release: (bucket: string) => Promise<void>
}

export interface RouteTable {
  // The port a host name is routed to, or undefined when it is not routed.
  portOf: (name: string) => Promise<number | undefined>
  add: (name: string, port: number) => Promise<void>
  // Removes the route; an absent route is skipped.
  remove: (name: string) => Promise<void>
}

export interface PortTable {
  // Whether another process listens on the port.
  isHeld: (port: number) => Promise<boolean>
}

export interface SupervisedProcess {
  name: string
  command: string
  args: string[]
  cwd: string
}

export interface Application {
  migrate: (env: Record<string, string>) => Promise<void>
  seed: (env: Record<string, string>) => Promise<void>
  // The worktree's processes, run by its supervisor.
  processes: (env: Record<string, string>) => SupervisedProcess[]
}

export interface SupervisorState {
  pid: number
}

export interface Supervisor {
  isRunning: (state: SupervisorState) => boolean
  start: (options: {
    root: string
    processes: SupervisedProcess[]
    env: Record<string, string>
  }) => Promise<SupervisorState>
  // Stops the supervisor and every process it started. A supervisor already
  // gone is skipped.
  stop: (state: SupervisorState) => Promise<void>
}

export interface ComputeService {
  url: string
  // Whether this use started it.
  started: boolean
  // The fingerprints of the other services running on the machine.
  others: string[]
}

// The machine's compute services: one container per fingerprint of
// services/compute, shared by the worktrees whose sources have it.
export interface ComputeServices {
  // The fingerprint of a worktree's services/compute: a hash of its files.
  fingerprintOf: (root: string) => Promise<string>
  // The fingerprint's running service, started when needed from its image,
  // built from the sources of the worktree at `sources` when missing
  // (UNKNOWN_COMPUTE_VERSION without them). The worktree joins its users.
  use: (fingerprint: string, identity: string, sources?: string) => Promise<ComputeService>
  // The worktree leaves the fingerprint's users; the service stops once none
  // remains.
  release: (fingerprint: string, identity: string) => Promise<void>
}

export interface Infrastructure {
  compute: ComputeServices
  prerequisites: Prerequisites
  shared: SharedInfrastructure
  postgres: PostgresAdmin
  garage: GarageAdmin
  routes: RouteTable
  ports: PortTable
  application: Application
  supervisor: Supervisor
}
