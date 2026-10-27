// The real infrastructure of the machine, as the dev commands use it.

import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { workerProcess } from './commands/index.ts'
import {
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
const databaseCli = join(codeRoot, 'packages/database/src/cli.ts')

// The database's and the API's command lines, and the processes of a worktree
// (the API, the front-end dev server and the worker), run on its configuration.
export function apiApplication(realWorkerLock: string): Application {
  const cli = (path: string, command: string, env: Record<string, string>) =>
    run(process.execPath, [path, command], { env: { ...process.env, ...env } })
  return {
    migrate: async (env) => {
      await cli(databaseCli, 'migrate', env)
    },
    seed: async (env) => {
      await cli(apiCli, 'seed-demo', env)
    },
    processes: (env) => [
      {
        name: 'api',
        command: process.execPath,
        args: ['--watch', join(codeRoot, 'apps/api/src/entry/main.ts')],
        cwd: codeRoot,
      },
      {
        name: 'web',
        command: process.execPath,
        args: [join(codeRoot, 'apps/web/node_modules/vite/bin/vite.js')],
        cwd: join(codeRoot, 'apps/web'),
      },
      // POLLY_WORKER_MODE, from the worktree's configuration, picks the
      // analyzer; in real mode the worker holds the machine's real-worker lock.
      workerProcess(env, realWorkerLock, {
        name: 'worker',
        command: 'uv',
        args: [
          'run',
          '--quiet',
          '--project',
          join(codeRoot, 'services/pron-worker'),
          'python',
          '-m',
          'pron_worker',
        ],
        cwd: join(codeRoot, 'services/pron-worker'),
      }),
    ],
  }
}

// Machine-wide, and gone at reboot like the processes holding it.
const realWorkerLock = join(
  process.env['XDG_RUNTIME_DIR'] ?? join(tmpdir(), `polly-dev-${userInfo().uid}`),
  'polly-dev',
  'real-worker.lock',
)

export function realInfrastructure(): Infrastructure {
  const shared = sharedInfrastructure()
  return {
    realWorkerLock,
    prerequisites,
    shared,
    postgres: postgresAdmin(shared),
    garage: garageAdmin(shared),
    routes: portlessRoutes(),
    ports: listeningPorts(),
    application: apiApplication(realWorkerLock),
    supervisor: processSupervisor(),
  }
}
