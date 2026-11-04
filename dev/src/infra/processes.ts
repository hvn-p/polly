// A worktree's processes, run by Docker Compose from dev/worktree.compose.yaml
// as a project of their own (research R2): Compose restarts a process that
// crashes and recreates one whose configuration changed, and `up --wait`
// waits for the health checks. The processes run on dependencies the project
// installs for Linux, in volumes of its own, never on the host's.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Refusal } from '@polly/platform'
import type { WorktreeProcesses, WorktreeProject } from '../ports/index.ts'
import { run } from './compose.ts'

const defaultComposeFile = join(import.meta.dirname, '..', '..', 'worktree.compose.yaml')
// The pnpm store and Corepack's cache, which the projects share.
const STORE = 'polly-dev-pnpm'

// The directories of the workspace that hold a node_modules, from the root:
// the root itself, and each package pnpm-workspace.yaml lists.
export function workspaceDirectories(codeRoot: string): string[] {
  const workspace = readFileSync(join(codeRoot, 'pnpm-workspace.yaml'), 'utf8')
  const patterns = (/^packages:\n((?:[ \t]+-.*\n?)+)/m.exec(workspace)?.[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').replace(/^["']|["']$/g, ''))
    .filter(Boolean)
  const isPackage = (directory: string) => existsSync(join(codeRoot, directory, 'package.json'))
  return [
    '',
    ...patterns.flatMap((pattern) =>
      pattern.endsWith('/*')
        ? readdirSync(join(codeRoot, pattern.slice(0, -2)))
            .sort()
            .map((name) => `${pattern.slice(0, -2)}/${name}`)
            .filter(isPackage)
        : [pattern].filter(isPackage),
    ),
  ]
}

export interface ProcessesSettings {
  // The checkout the processes run from: its builds and its workspace.
  codeRoot: string
  // Put before the identity to name a project: polly- on the machine.
  prefix?: string
  composeFile?: string
}

interface ComposeService {
  Service: string
  State: string
  Health: string
  ExitCode: number
}

// Running, or done: the install exits once the dependencies are in place.
const isUp = ({ State, ExitCode }: ComposeService) =>
  State === 'running' || (State === 'exited' && ExitCode === 0)

export function composeProcesses(settings: ProcessesSettings): WorktreeProcesses {
  const { codeRoot, prefix = 'polly-', composeFile = defaultComposeFile } = settings
  // The repository's git directory: a worktree's .git is a file naming it.
  const gitDirectory = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: codeRoot,
    encoding: 'utf8',
  }).trim()

  const logsOf = (project: WorktreeProject) => join(project.root, '.dev', 'logs')
  const envOf = (project: WorktreeProject) => ({
    ...process.env,
    POLLY_UID: String(process.getuid?.() ?? 1000),
    POLLY_GID: String(process.getgid?.() ?? 1000),
    POLLY_CODE_ROOT: codeRoot,
    POLLY_GIT_DIR: gitDirectory,
    POLLY_ENV_FILE: join(project.root, '.env.local'),
    POLLY_LOGS: logsOf(project),
  })
  // The second Compose file: a volume of the project over each node_modules
  // of the workspace, in every service.
  const nodeModulesFile = async (project: WorktreeProject) => {
    const services = (
      await run('docker', ['compose', '-f', composeFile, 'config', '--services'], { env: envOf(project) })
    )
      .split('\n')
      .filter(Boolean)
    const directories = workspaceDirectories(codeRoot)
    const volumeOf = (directory: string) =>
      ['node-modules', ...directory.split('/')].filter(Boolean).join('-')
    const mounts = directories.map((directory) => ({
      type: 'volume',
      source: volumeOf(directory),
      target: join(codeRoot, directory, 'node_modules'),
    }))
    const file = join(project.root, '.dev', 'node-modules.compose.json')
    mkdirSync(join(project.root, '.dev'), { recursive: true })
    writeFileSync(
      file,
      `${JSON.stringify({
        services: Object.fromEntries(services.map((service) => [service, { volumes: mounts }])),
        volumes: Object.fromEntries(directories.map((directory) => [volumeOf(directory), {}])),
      })}\n`,
    )
    return file
  }
  const compose = async (project: WorktreeProject, args: readonly string[]) =>
    run(
      'docker',
      ['compose', '-f', composeFile, '-f', await nodeModulesFile(project), '-p', project.name, ...args],
      {
        env: envOf(project),
      },
    )
  const services = async (project: WorktreeProject): Promise<ComposeService[]> =>
    (await compose(project, ['ps', '--all', '--format', 'json']))
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as ComposeService)
  // Runs an `up` of every process, or of the one given; when it fails, names
  // the first of them that is not ready, or else lets the `up`'s error through.
  const up = async (project: WorktreeProject, args: readonly string[], only?: string) => {
    mkdirSync(logsOf(project), { recursive: true })
    await run('docker', ['volume', 'create', STORE])
    try {
      await compose(project, ['up', '--detach', '--wait', '--quiet-pull', ...args])
    } catch (error) {
      const listed = await services(project).catch(() => [])
      const failed = listed.find(
        (service) =>
          (only === undefined || service.Service === only) &&
          (!isUp(service) || (service.Health !== '' && service.Health !== 'healthy')),
      )
      if (failed === undefined) {
        throw error
      }
      throw new Refusal(
        'PROCESS_NOT_READY',
        `${failed.Service} is ${failed.Health || failed.State}; see ${join(logsOf(project), `${failed.Service}.log`)}, fix it, then run nr dev:up`,
      )
    }
  }

  return {
    projectOf: (identity, root) => ({ name: `${prefix}${identity}`, identity, root }),
    start: (project) => up(project, ['--remove-orphans']),
    isRunning: async (project) => {
      const expected = (await compose(project, ['config', '--services'])).split('\n').filter(Boolean)
      const running = new Set((await services(project)).filter(isUp).map(({ Service }) => Service))
      return expected.every((service) => running.has(service))
    },
    restart: (project, service) => up(project, ['--no-deps', '--force-recreate', service], service),
    stop: async (name) => {
      // By name alone: the project's containers and volumes carry it, whatever
      // the files. The store is not the project's.
      await run(
        'docker',
        ['compose', '-p', name, 'down', '--remove-orphans', '--volumes', '--timeout', '5'],
        {
          cwd: tmpdir(),
        },
      )
    },
  }
}
