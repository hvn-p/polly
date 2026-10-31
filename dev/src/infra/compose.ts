// The shared infrastructure, run by Docker compose from dev/compose.yaml.

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Refusal } from '@polly/platform'
import { lock } from '../machine/index.ts'
import type { SharedInfrastructure } from '../ports/index.ts'

const worktreeComposeFile = join(import.meta.dirname, '..', '..', 'compose.yaml')

export interface ComposeSettings {
  project: string
  postgresPort: number
  garagePort: number
  // Machine-wide state of the project: the start lock, and the Postgres
  // superuser password, generated once.
  machineDirectory: string
  // The worktree's compose file by default.
  composeFile?: string
}

export interface ComposeInfrastructure extends SharedInfrastructure {
  project: string
  machineDirectory: string
  postgresPort: number
  garagePort: number
  // Runs a command in a service's container and returns its stdout.
  exec: (service: 'postgres' | 'garage', args: readonly string[], input?: string) => Promise<string>
}

export function run(
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv; input?: string } = {},
) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { encoding: 'utf8', env: options.env ?? process.env },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim() || error.message}`))
        } else {
          resolve(stdout)
        }
      },
    )
    // A command that fails to start closes its stdin: its failure is
    // reported through its exit, not through this write.
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(options.input ?? '')
  })
}

function superuserPassword(directory: string): string {
  const file = join(directory, 'postgres-password')
  if (!existsSync(file)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    writeFileSync(file, randomBytes(24).toString('hex'), { mode: 0o600, flag: 'wx' })
  }
  return readFileSync(file, 'utf8')
}

export function composeInfrastructure(settings: ComposeSettings): ComposeInfrastructure {
  const env = () => ({
    ...process.env,
    POLLY_DEV_POSTGRES_PASSWORD: superuserPassword(settings.machineDirectory),
    POLLY_DEV_POSTGRES_PORT: String(settings.postgresPort),
    POLLY_DEV_GARAGE_PORT: String(settings.garagePort),
  })
  const composeFile = settings.composeFile ?? worktreeComposeFile
  const compose = (args: readonly string[], input?: string) =>
    run('docker', ['compose', '-f', composeFile, '-p', settings.project, ...args], {
      env: env(),
      ...(input === undefined ? {} : { input }),
    })
  // The services whose containers run a configuration other than this
  // worktree's compose file: up would recreate them under every worktree.
  const differingServices = async () => {
    const hashes = (output: string) =>
      new Map(
        output
          .trim()
          .split('\n')
          .map((line) => line.split(' ') as [string, string]),
      )
    const expected = hashes(await compose(['config', '--hash', '*']))
    const running = await run('docker', [
      'ps',
      '--all',
      '--filter',
      `label=com.docker.compose.project=${settings.project}`,
      '--format',
      '{{.Label "com.docker.compose.service"}} {{.Label "com.docker.compose.config-hash"}}',
    ])
    return [...hashes(running)]
      .filter(([service, hash]) => service !== '' && expected.get(service) !== hash)
      .map(([service]) => service)
      .sort()
  }
  return {
    project: settings.project,
    machineDirectory: settings.machineDirectory,
    postgresPort: settings.postgresPort,
    garagePort: settings.garagePort,
    ensureRunning: async () => {
      const held = await lock(join(settings.machineDirectory, 'infra.lock'))
      try {
        const differing = await differingServices()
        if (differing.length > 0) {
          throw new Refusal(
            'SHARED_INFRASTRUCTURE_DIFFERS',
            `${differing.join(', ')} of ${settings.project} run a configuration other than ${composeFile}; ` +
              `once every worktree has that change, run docker compose -p ${settings.project} down (the data stays), then this command again`,
          )
        }
        await compose(['up', '--detach', '--wait', '--quiet-pull'])
      } finally {
        await held.release()
      }
    },
    exec: (service, args, input) => compose(['exec', '-T', '-e', 'RUST_LOG=warn', service, ...args], input),
  }
}

export const POSTGRES_PORT = 55432
export const GARAGE_PORT = 53900

export function sharedInfrastructure(): ComposeInfrastructure {
  const state = process.env['XDG_STATE_HOME'] ?? join(homedir(), '.local', 'state')
  return composeInfrastructure({
    project: 'polly-dev',
    postgresPort: POSTGRES_PORT,
    garagePort: GARAGE_PORT,
    machineDirectory: join(state, 'polly-dev'),
  })
}
