// A worktree's processes, run by Docker Compose from dev/worktree.compose.yaml
// as a project of their own (research R2): Compose restarts a process that
// crashes and recreates one whose configuration changed, and `up --wait`
// waits for the health checks.

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Refusal } from '@polly/platform'
import { architectureHostOf } from '../identity/index.ts'
import type { WorktreeProcesses, WorktreeProject } from '../ports/index.ts'
import { analyzerPathOf } from './architecture.ts'
import { run } from './compose.ts'

const defaultComposeFile = join(import.meta.dirname, '..', '..', 'worktree.compose.yaml')

export interface ProcessesSettings {
  // The checkout the processes run from: its builds and its node_modules.
  codeRoot: string
  // Put before the identity to name a project: polly- on the machine.
  prefix?: string
  // Whether the architecture view runs: by default, when the checkout has an
  // analyzer holding it.
  architecture?: boolean
  composeFile?: string
}

interface ComposeService {
  Service: string
  State: string
  Health: string
}

export function composeProcesses(settings: ProcessesSettings): WorktreeProcesses {
  const { codeRoot, prefix = 'polly-', composeFile = defaultComposeFile } = settings
  const analyzer = analyzerPathOf(codeRoot)
  const architecture = settings.architecture ?? analyzer !== undefined
  // The repository's git directory: a worktree's .git is a file naming it.
  const gitDirectory = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: codeRoot,
    encoding: 'utf8',
  }).trim()

  const logsOf = (project: WorktreeProject) => join(project.root, '.dev', 'logs')
  const compose = (project: WorktreeProject, args: readonly string[]) =>
    run(
      'docker',
      [
        'compose',
        '-f',
        composeFile,
        '-p',
        project.name,
        ...(architecture ? ['--profile', 'architecture'] : []),
        ...args,
      ],
      {
        env: {
          ...process.env,
          POLLY_UID: String(process.getuid?.() ?? 1000),
          POLLY_GID: String(process.getgid?.() ?? 1000),
          POLLY_CODE_ROOT: codeRoot,
          POLLY_GIT_DIR: gitDirectory,
          POLLY_ENV_FILE: join(project.root, '.env.local'),
          POLLY_LOGS: logsOf(project),
          POLLY_ANALYZER: analyzer ?? '',
          POLLY_ARCH_HOST: architectureHostOf(project.identity),
        },
      },
    )
  const services = async (project: WorktreeProject): Promise<ComposeService[]> =>
    (await compose(project, ['ps', '--all', '--format', 'json']))
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as ComposeService)
  // Runs an `up`; when it fails, names the first process that is not ready.
  const up = async (project: WorktreeProject, args: readonly string[]) => {
    mkdirSync(logsOf(project), { recursive: true })
    try {
      await compose(project, ['up', '--detach', '--wait', '--quiet-pull', ...args])
    } catch (error) {
      const failed = (await services(project)).find(
        ({ State, Health }) => State !== 'running' || (Health !== '' && Health !== 'healthy'),
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
      const running = new Set(
        (await services(project)).filter(({ State }) => State === 'running').map(({ Service }) => Service),
      )
      return expected.every((service) => running.has(service))
    },
    restart: (project, service) => up(project, ['--no-deps', '--force-recreate', service]),
    stop: async (name) => {
      // By name alone: the project's containers carry it, whatever the files.
      await run('docker', ['compose', '-p', name, 'down', '--remove-orphans', '--timeout', '5'], {
        cwd: tmpdir(),
      })
    },
  }
}
