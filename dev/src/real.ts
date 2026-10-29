// The real infrastructure of the machine, as the dev commands use it.

import { join } from 'node:path'
import {
  computeServices,
  garageAdmin,
  listeningPorts,
  portlessRoutes,
  postgresAdmin,
  run,
  sharedInfrastructure,
} from './infra/index.ts'
import { prerequisites } from './machine/index.ts'
import type { Application, Infrastructure } from './ports/index.ts'
import { processSupervisor } from './supervisor/index.ts'

const codeRoot = join(import.meta.dirname, '..', '..')
const apiCli = join(codeRoot, 'apps/api/src/entry/cli.ts')
const migrationsCli = join(codeRoot, 'packages/migrations/src/cli.ts')

// The database's and the API's command lines, and the processes of a worktree
// (the API, the front-end dev server and the worker), run on its configuration.
export function apiApplication(): Application {
  const cli = (path: string, command: string, env: Record<string, string>) =>
    run(process.execPath, [path, command], { env: { ...process.env, ...env } })
  return {
    migrate: async (env) => {
      await cli(migrationsCli, 'migrate', env)
    },
    seed: async (env) => {
      await cli(apiCli, 'seed-demo', env)
    },
    processes: () => [
      {
        name: 'api',
        command: process.execPath,
        args: ['--watch', join(codeRoot, 'apps/api/src/entry/main.ts')],
        cwd: codeRoot,
      },
      {
        name: 'mcp',
        command: process.execPath,
        args: ['--watch', join(codeRoot, 'apps/mcp/src/main.ts')],
        cwd: codeRoot,
      },
      {
        name: 'web',
        command: process.execPath,
        args: [join(codeRoot, 'apps/web/node_modules/vite/bin/vite.js')],
        cwd: join(codeRoot, 'apps/web'),
      },
      // POLLY_WORKER_MODE, from the worktree's configuration, picks the
      // analyzer.
      {
        name: 'worker',
        command: process.execPath,
        args: ['--watch', join(codeRoot, 'apps/worker/src/main.ts')],
        cwd: codeRoot,
      },
    ],
  }
}

export function realInfrastructure(): Infrastructure {
  const shared = sharedInfrastructure()
  return {
    compute: computeServices(shared),
    prerequisites,
    shared,
    postgres: postgresAdmin(shared),
    garage: garageAdmin(shared),
    routes: portlessRoutes(),
    ports: listeningPorts(),
    application: apiApplication(),
    supervisor: processSupervisor(),
  }
}
