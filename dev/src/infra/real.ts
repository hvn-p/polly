// The real infrastructure of the machine, as the dev commands use it.

import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { workerProcess } from '../commands/worker.ts'
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

// The API's command line, and the processes of a worktree (the API, the
// front-end dev server and the worker), run on its configuration.
export function apiApplication(realWorkerLock: string): Application {
  const cli = (command: string, env: Record<string, string>) =>
    run(process.execPath, [apiCli, command], { env: { ...process.env, ...env } })
  return {
    migrate: async (env) => {
      await cli('migrate', env)
    },
    seed: async (env) => {
      await cli('seed-demo', env)
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
