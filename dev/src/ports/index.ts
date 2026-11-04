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

export interface Application {
  migrate: (env: Record<string, string>) => Promise<void>
  seed: (env: Record<string, string>) => Promise<void>
}

// The architecture view of a worktree, as a project of its own: the analyzer
// in watch mode, from the version the repository pins or from the worktree's
// sources.
export interface ArchitectureView {
  // The project's name for a worktree identity.
  projectOf: (identity: string) => string
  // Starts or recreates the project and waits until it answers; unavailable,
  // with nothing running, when the pinned version holds no view.
  // PROCESS_NOT_READY when it does not build or answer.
  start: (
    name: string,
    view: { root: string; port: number; host: string; from: 'package' | 'source' },
  ) => Promise<'served' | 'unavailable'>
  // Removes the project; one already gone is skipped.
  stop: (name: string) => Promise<void>
}

// A worktree's processes, as one project: its name, the worktree's identity,
// and the worktree whose .env.local they read and whose .dev/logs they write to.
export interface WorktreeProject {
  name: string
  identity: string
  root: string
}

export interface WorktreeProcesses {
  // The project's name for a worktree identity.
  projectOf: (identity: string, root: string) => WorktreeProject
  // Starts what does not run, recreates a process whose configuration
  // changed, then waits until every process is healthy; PROCESS_NOT_READY
  // names one that is not.
  start: (project: WorktreeProject) => Promise<void>
  // Whether every process of the project runs.
  isRunning: (project: WorktreeProject) => Promise<boolean>
  // Recreates one process on the worktree's configuration as it now is, the
  // others left running.
  restart: (project: WorktreeProject, process: string) => Promise<void>
  // Removes every process of the project; one already gone is skipped.
  stop: (name: string) => Promise<void>
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
  processes: WorktreeProcesses
  architecture: ArchitectureView
}
