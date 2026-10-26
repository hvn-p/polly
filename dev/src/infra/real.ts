// The real infrastructure of the machine, as the dev commands use it.

import { join } from 'node:path'
import { processSupervisor } from '../supervisor/index.ts'
import { run, sharedInfrastructure } from './compose.ts'
import { garageAdmin } from './garage.ts'
import { listeningPorts } from './listening.ts'
import { portlessRoutes } from './portless.ts'
import type { Application, Infrastructure } from './ports.ts'
import { postgresAdmin } from './postgres.ts'
import { prerequisites } from './prerequisites.ts'

const codeRoot = join(import.meta.dirname, '..', '..', '..')
const apiCli = join(codeRoot, 'apps/api/src/entry/cli.ts')

// The API's command line and processes, run on a worktree's configuration.
export function apiApplication(): Application {
  const cli = (command: string, env: Record<string, string>) =>
    run(process.execPath, [apiCli, command], { env: { ...process.env, ...env } })
  return {
    migrate: async (env) => {
      await cli('migrate', env)
    },
    seed: async (env) => {
      await cli('seed-demo', env)
    },
    processes: () => [
      {
        name: 'api',
        command: process.execPath,
        args: ['--watch', join(codeRoot, 'apps/api/src/entry/main.ts')],
        cwd: codeRoot,
      },
    ],
  }
}

export function realInfrastructure(): Infrastructure {
  const shared = sharedInfrastructure()
  return {
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
