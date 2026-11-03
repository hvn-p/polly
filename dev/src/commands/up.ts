// dev:up: brings the worktree's Polly up, creating only what is missing.
// The order is that of contracts/dev-commands.md in the feature's issue.

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { Refusal } from '@polly/platform'
import { completeEnv } from '../config/index.ts'
import { tryLock } from '../machine/index.ts'
import type { Infrastructure, Prerequisites } from '../ports/index.ts'
import {
  bucketAccessOf,
  currentBranch,
  readEnv,
  readState,
  required,
  resourcesOf,
  worktreeAt,
  writeState,
} from '../worktree/index.ts'
import { setEnv, useCompute } from './worker.ts'

const template = join(import.meta.dirname, '..', '..', 'env.template')

// The Postgres extensions Polly declares; none yet.
const EXTENSIONS: readonly string[] = []

export interface UpOptions {
  root: string
  prerequisites: Prerequisites
  // Called once the checks pass and the worktree lock is held.
  infrastructure: () => Promise<Infrastructure>
  // stdout: the worktree URL, alone.
  out: (line: string) => void
  // stderr: everything else, warnings included.
  warn: (line: string) => void
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  if (typeof address !== 'object' || address === null) {
    throw new Error('no free port')
  }
  return address.port
}

// `git worktree add` does not initialise submodules.
function initialiseInfraSubmodule(root: string): void {
  const modules = join(root, '.gitmodules')
  if (!existsSync(modules) || !readFileSync(modules, 'utf8').includes('path = vendors/infra')) {
    return
  }
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (git('submodule', 'status', '--', 'vendors/infra').startsWith('-')) {
    git('submodule', 'update', '--init', '--', 'vendors/infra')
  }
}

export async function up({ root, prerequisites, infrastructure, out, warn }: UpOptions): Promise<void> {
  const missing = await prerequisites.missing()
  if (missing !== undefined) {
    throw new Refusal('MISSING_PREREQUISITE', `${missing} is missing; install it, then run nr dev:up again`)
  }
  const branch = currentBranch(root)
  const worktree = worktreeAt(root)
  const lock = await tryLock(worktree.upLock)
  if (lock === undefined) {
    throw new Refusal('DEV_UP_IN_PROGRESS', 'another dev:up runs in this worktree; let it finish')
  }
  try {
    const infra = await infrastructure()
    initialiseInfraSubmodule(root)
    await infra.shared.ensureRunning()

    const existing = existsSync(worktree.envFile) ? readFileSync(worktree.envFile, 'utf8') : ''
    const completed = await completeEnv(readFileSync(template, 'utf8'), existing, {
      branch,
      postgresPort: infra.shared.postgresPort,
      garagePort: infra.shared.garagePort,
      freePort,
      random: randomBytes,
    })
    if (completed !== existing) {
      writeFileSync(worktree.envFile, completed, { mode: 0o600 })
    }
    let env = readEnv(worktree) ?? {}
    const resources = resourcesOf(env)
    const webPort = Number(required(env, 'POLLY_WEB_PORT'))
    const state = readState(worktree)

    // In real mode, the worker follows the compute service of its worktree's
    // code, unless dev:worker pointed it at another version on purpose: its
    // service then differs from the fingerprint .env.local records as its own.
    const real = env['POLLY_WORKER_MODE'] === 'real'
    const recorded = env['POLLY_COMPUTE_FINGERPRINT']
    const chosen = state.compute !== undefined && state.compute !== recorded ? state.compute : undefined
    const computeChanged = real && (await infra.compute.fingerprintOf(root)) !== recorded
    const project = infra.processes.projectOf(resources.identity, root)
    const running = await infra.processes.isRunning(project)
    if (!running) {
      // What is left of the project holds the worktree's own ports: it is
      // removed before a port counts as held by another.
      if (state.project !== undefined) {
        await infra.processes.stop(state.project)
      }
      for (const key of ['POLLY_API_PORT', 'POLLY_MCP_PORT', 'POLLY_WEB_PORT', 'POLLY_ARCH_PORT']) {
        const port = Number(required(env, key))
        if (await infra.ports.isHeld(port)) {
          throw new Refusal(
            'RESOURCE_CONFLICT',
            `port ${port} (${key}) is held by another process; stop it, then run nr dev:up`,
          )
        }
      }
    }
    // Each host name routed to its process, or to nothing yet.
    const routes = [
      { name: resources.route, host: resources.host, port: webPort },
      {
        name: resources.architectureRoute,
        host: resources.architectureHost,
        port: Number(required(env, 'POLLY_ARCH_PORT')),
      },
    ]
    const unrouted: typeof routes = []
    for (const route of routes) {
      const routedPort = await infra.routes.portOf(route.name)
      if (routedPort === undefined) {
        unrouted.push(route)
      } else if (routedPort !== route.port) {
        throw new Refusal(
          'RESOURCE_CONFLICT',
          `${route.host} is routed to port ${routedPort}, not ${route.port}; remove that route, then run nr dev:up`,
        )
      }
    }

    await infra.postgres.ensure(resources.database, EXTENSIONS)
    const bucket = bucketAccessOf(env)
    await infra.garage.ensure(bucket, Number(required(env, 'S3_EXPIRATION_DAYS')))
    await infra.application.migrate(env)
    await infra.application.seed(env)
    for (const route of unrouted) {
      await infra.routes.add(route.name, route.port)
    }
    let compute = state.compute
    if (real && (!running || computeChanged)) {
      // As dev:worker real: its own code's service, or the one it chose.
      const used = await useCompute(root, infra, resources.identity, warn, chosen)
      env = setEnv(worktree, used.env)
      if (compute !== undefined && compute !== used.fingerprint) {
        await infra.compute.release(compute, resources.identity)
      }
      compute = used.fingerprint
      // Recorded before the processes start: if they fail, dev:down still
      // releases the service this worktree now uses.
      writeState(worktree, { ...readState(worktree), compute })
    }
    writeState(worktree, { ...readState(worktree), project: project.name })
    // Compose starts what does not run and recreates a process whose
    // configuration changed, .env.local included; the others keep running.
    await infra.processes.start(project)
    writeState(worktree, {
      project: project.name,
      route: resources.route,
      architectureRoute: resources.architectureRoute,
      role: resources.database.names.role,
      garageKeyId: bucket.accessKeyId,
      ...(compute === undefined ? {} : { compute }),
    })
    warn(
      infra.application.architecture() === 'missing'
        ? 'ARCHITECTURE_VIEW_UNAVAILABLE: no analyzer here holds the view; run cargo build --release in tools/architecture/analyzer, then nr dev:up'
        : `architecture view: https://${resources.architectureHost}`,
    )
    out(required(env, 'PUBLIC_URL'))
  } finally {
    await lock.release()
  }
}
