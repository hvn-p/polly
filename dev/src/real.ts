// The real infrastructure of the machine, as the dev commands use it.

import { join } from 'node:path'
import {
  analyzerOf,
  architectureProcesses,
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
import { architectureHostOf, required } from './worktree/index.ts'

const codeRoot = join(import.meta.dirname, '..', '..')
// Every Node process runs from its build (scripts/build/processes.ts), which
// nr dev:* writes before the command runs.
const apiCli = join(codeRoot, 'apps/api/dist/cli.js')
const migrationsCli = join(codeRoot, 'packages/migrations/dist/cli.js')
const build = join(codeRoot, 'scripts/build/processes.ts')

// The database's and the API's command lines, and the processes of a worktree
// (the API, the MCP server, the front-end dev server, the worker and the
// architecture view), run on its configuration.
export function apiApplication(): Application {
  const cli = (path: string, command: string, env: Record<string, string>) =>
    run(process.execPath, [path, command], { env: { ...process.env, ...env } })
  return {
    architecture: () => analyzerOf(codeRoot),
    migrate: async (env) => {
      await cli(migrationsCli, 'migrate', env)
    },
    seed: async (env) => {
      await cli(apiCli, 'seed-demo', env)
    },
    processes: (env) => [
      // Rebuilds the processes below on each change; node --watch restarts
      // each on its new build.
      {
        name: 'build',
        command: process.execPath,
        args: [build, '--watch', 'api', 'mcp', 'worker'],
        cwd: codeRoot,
      },
      {
        name: 'api',
        command: process.execPath,
        args: ['--watch', join(codeRoot, 'apps/api/dist/main.js')],
        cwd: codeRoot,
      },
      {
        name: 'mcp',
        command: process.execPath,
        args: ['--watch', join(codeRoot, 'apps/mcp/dist/main.js')],
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
        args: ['--watch', join(codeRoot, 'apps/worker/dist/main.js')],
        cwd: codeRoot,
      },
      ...architectureProcesses({
        codeRoot,
        port: Number(required(env, 'POLLY_ARCH_PORT')),
        host: architectureHostOf(required(env, 'POLLY_WORKTREE_ID')),
      }),
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
