// Starts and stops the analyzer in watch mode, serving its view for one
// checkout, as a Docker Compose project of its own (compose.yaml): from a
// published version of @hvn-p/architecture, or from the analyzer's sources,
// built in a container. A repository's development environment runs it as a
// command: it imports nothing of that repository.
//
// Usage:
//   node serve.ts up --project <name> --root <checkout> --port <n>
//     --allow-host <name> --logs <dir> [--base <ref>]
//     (--version <published version> | --source <the tool's directory>)
//   node serve.ts down --project <name>
// A refusal prints `<CODE>: <message>` on stderr and exits 1; an unexpected
// failure exits 2.

import { execFile, spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

export class ServeRefusal extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export interface ServeOptions {
  project: string
  // The checkout the analyzer reads.
  root: string
  port: number
  // The only host name the analyzer answers.
  allowHost: string
  // Where architecture.log is written: the analyzer's output and its build's.
  logs: string
  // The branch the view compares with; main by default.
  base?: string
  // A published version, or the tool's directory (analyzer/ and ui/).
  from: { version: string } | { source: string }
}

const composeFile = join(import.meta.dirname, 'compose.yaml')
const dockerfile = join(import.meta.dirname, 'Dockerfile')
// Where both images hold the view the analyzer serves.
const VIEW = '/usr/local/share/architecture/view'

function output(command: string, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', ...(cwd === undefined ? {} : { cwd }) },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(stdout.trim())
        } else {
          reject(new Error(`${command} ${args.join(' ')} failed: ${stderr.trim() || error.message}`))
        }
      },
    )
  })
}

// Runs a command with its output appended to the log; whether it succeeded.
function logged(
  log: string,
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<boolean> {
  const fd = openSync(log, 'a')
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', fd, fd] })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  }).finally(() => closeSync(fd))
}

const imageOf = (project: string) => `${project}:analyzer`

// Builds the project's image; the build's output goes to the log.
async function build(project: string, from: ServeOptions['from'], log: string): Promise<void> {
  const image = imageOf(project)
  if ('version' in from) {
    const built = await logged(log, 'docker', [
      'build',
      '--quiet',
      '--target',
      'package',
      '--build-arg',
      `VERSION=${from.version}`,
      '--tag',
      image,
      '--file',
      dockerfile,
      import.meta.dirname,
    ])
    if (!built) {
      throw new ServeRefusal(
        'PROCESS_NOT_READY',
        `@hvn-p/architecture ${from.version} did not install; see ${log}`,
      )
    }
    // A version older than the view runs no watch mode worth serving.
    const view = await logged(log, 'docker', ['run', '--rm', '--entrypoint', 'test', image, '-d', VIEW])
    if (!view) {
      await stop(project)
      throw new ServeRefusal(
        'ARCHITECTURE_VIEW_UNAVAILABLE',
        `@hvn-p/architecture ${from.version} holds no view`,
      )
    }
    return
  }
  const ui = join(from.source, 'ui')
  const analyzer = join(from.source, 'analyzer')
  const view = await logged(log, process.execPath, [join(ui, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: ui,
  })
  // The container holds no git checkout: the identity of the sources is
  // computed here, and given to the build (build.rs).
  const identity = await output(process.execPath, [join(analyzer, 'identity.mjs')], analyzer)
  const built =
    view &&
    (await logged(log, 'docker', [
      'build',
      '--target',
      'source',
      '--build-context',
      `view=${join(ui, 'dist')}`,
      '--build-arg',
      `ANALYZER_IDENTITY=${identity}`,
      '--tag',
      image,
      '--file',
      dockerfile,
      analyzer,
    ]))
  if (!built) {
    throw new ServeRefusal('PROCESS_NOT_READY', `the analyzer or its view did not build; see ${log}`)
  }
}

// Builds the analyzer's image, then starts or recreates its project and waits
// until it answers.
export async function serve(options: ServeOptions): Promise<void> {
  const { project, root, port, allowHost, logs, base = 'main', from } = options
  mkdirSync(logs, { recursive: true })
  const log = join(logs, 'architecture.log')
  await build(project, from, log)
  // A worktree's .git is a file naming the repository's git directory.
  const gitDirectory = await output('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], root)
  const started = await logged(
    log,
    'docker',
    ['compose', '-f', composeFile, '-p', project, 'up', '--detach', '--wait', '--quiet-pull'],
    {
      cwd: tmpdir(),
      env: {
        ...process.env,
        ARCHITECTURE_IMAGE: imageOf(project),
        ARCHITECTURE_UID: String(process.getuid?.() ?? 1000),
        ARCHITECTURE_GID: String(process.getgid?.() ?? 1000),
        ARCHITECTURE_ROOT: root,
        ARCHITECTURE_GIT_DIR: gitDirectory,
        ARCHITECTURE_LOGS: logs,
        ARCHITECTURE_PORT: String(port),
        ARCHITECTURE_HOST: allowHost,
        ARCHITECTURE_BASE: base,
      },
    },
  )
  if (!started) {
    throw new ServeRefusal('PROCESS_NOT_READY', `the analyzer does not answer; see ${log}`)
  }
}

// Removes the project and its image; what is already gone is skipped.
export async function stop(project: string): Promise<void> {
  await output('docker', ['compose', '-p', project, 'down', '--remove-orphans', '--timeout', '5'], tmpdir())
  await output('docker', ['image', 'rm', '--force', imageOf(project)]).catch(() => undefined)
}

async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      root: { type: 'string' },
      port: { type: 'string' },
      'allow-host': { type: 'string' },
      logs: { type: 'string' },
      base: { type: 'string' },
      version: { type: 'string' },
      source: { type: 'string' },
    },
  })
  const required = (name: keyof typeof values): string => {
    const value = values[name]
    if (value === undefined) {
      throw new Error(`--${name} is required`)
    }
    return value
  }
  switch (positionals[0]) {
    case 'up':
      return serve({
        project: required('project'),
        root: required('root'),
        port: Number(required('port')),
        allowHost: required('allow-host'),
        logs: required('logs'),
        ...(values.base === undefined ? {} : { base: values.base }),
        from: values.source === undefined ? { version: required('version') } : { source: values.source },
      })
    case 'down':
      return stop(required('project'))
    default:
      throw new Error(`${positionals[0] ?? ''}: the commands are up and down`)
  }
}

if (process.argv[1] === import.meta.filename) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    if (error instanceof ServeRefusal) {
      console.error(`${error.code}: ${error.message}`)
      process.exitCode = 1
    } else {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 2
    }
  }
}
