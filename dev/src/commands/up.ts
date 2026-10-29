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
  // Called once the checks pass and the worktree lock is held: installs the
  // dependencies the infrastructure adapters need, then loads them.
  infrastructure: () => Promise<Infrastructure>
  out: (line: string) => void
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

export async function up({ root, prerequisites, infrastructure, out }: UpOptions): Promise<void> {
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

    const running = state.supervisor !== undefined && infra.supervisor.isRunning(state.supervisor)
    if (!running) {
      if (state.supervisor !== undefined) {
        // Processes a killed supervisor left behind hold the worktree's own
        // ports: they are stopped before a port counts as held by another.
        await infra.supervisor.stop(state.supervisor)
      }
      for (const key of ['POLLY_API_PORT', 'POLLY_MCP_PORT', 'POLLY_WEB_PORT']) {
        const port = Number(required(env, key))
        const holder = await infra.ports.holderOf(port)
        if (holder !== undefined) {
          throw new Refusal(
            'RESOURCE_CONFLICT',
            `port ${port} (${key}) is held by ${holder}; stop it, then run nr dev:up`,
          )
        }
      }
    }
    const routedPort = await infra.routes.portOf(resources.route)
    if (routedPort !== undefined && routedPort !== webPort) {
      throw new Refusal(
        'RESOURCE_CONFLICT',
        `${resources.host} is routed to port ${routedPort}, not ${webPort}; remove that route, then run nr dev:up`,
      )
    }

    await infra.postgres.ensure(resources.database, EXTENSIONS)
    const bucket = bucketAccessOf(env)
    await infra.garage.ensure(bucket, Number(required(env, 'S3_EXPIRATION_DAYS')))
    await infra.application.migrate(env)
    await infra.application.seed(env)
    if (routedPort === undefined) {
      await infra.routes.add(resources.route, webPort)
    }
    let supervisor = state.supervisor
    let compute = state.compute
    if (supervisor === undefined || !running) {
      if (env['POLLY_WORKER_MODE'] === 'real') {
        // As dev:worker real, on the service the worktree last chose.
        const used = await useCompute(root, infra, resources.identity, out, compute)
        env = setEnv(worktree, used.env)
        compute = used.fingerprint
      }
      supervisor = await infra.supervisor.start({ root, processes: infra.application.processes(env), env })
    }
    writeState(worktree, {
      supervisor,
      route: resources.route,
      role: resources.database.names.role,
      garageKeyId: bucket.accessKeyId,
      ...(compute === undefined ? {} : { compute }),
    })
    out(required(env, 'PUBLIC_URL'))
  } finally {
    await lock.release()
  }
}
