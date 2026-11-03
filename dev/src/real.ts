// The real infrastructure of the machine, as the dev commands use it.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  analyzerOf,
  composeProcesses,
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

const codeRoot = join(import.meta.dirname, '..', '..')
// Every Node process runs from its build (scripts/build/processes.ts), which
// nr dev:* writes before the command runs.
const apiCli = join(codeRoot, 'apps/api/dist/cli.js')
const migrationsCli = join(codeRoot, 'packages/migrations/dist/cli.js')

// The database's and the API's command lines, run on a worktree's
// configuration. exists: whether a file of the checkout is there, which picks
// the analyzer.
export function apiApplication(exists: (path: string) => boolean = existsSync): Application {
  const cli = (path: string, command: string, env: Record<string, string>) =>
    run(process.execPath, [path, command], { env: { ...process.env, ...env } })
  return {
    architecture: () => analyzerOf(codeRoot, exists),
    migrate: async (env) => {
      await cli(migrationsCli, 'migrate', env)
    },
    seed: async (env) => {
      await cli(apiCli, 'seed-demo', env)
    },
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
    processes: composeProcesses({ codeRoot }),
  }
}
