// Entry point of the dev commands: `node dev/src/main.ts <command> [args]`.
// A refusal prints `<CODE>: <message>` and exits 1; an unexpected failure
// exits 2.

import { Refusal } from '@polly/platform'
import { agent, down, e2e, up, url, worker } from './commands/index.ts'
import { installDependencies, prerequisites } from './machine/index.ts'
import type { Infrastructure } from './ports/index.ts'

export interface Io {
  cwd: string
  stdout: (line: string) => void
  stderr: (line: string) => void
  infra?: Infrastructure
}

async function infrastructure(io: Io): Promise<Infrastructure> {
  if (io.infra !== undefined) {
    return io.infra
  }
  const { realInfrastructure } = await import('./real.ts')
  return realInfrastructure()
}

export async function run(argv: readonly string[], io: Io): Promise<number> {
  const [command = ''] = argv
  try {
    switch (command) {
      case 'up':
        await up({
          root: io.cwd,
          prerequisites: io.infra?.prerequisites ?? prerequisites,
          infrastructure: async () => {
            if (io.infra === undefined) {
              installDependencies(io.cwd)
            }
            return infrastructure(io)
          },
          out: io.stdout,
        })
        return 0
      case 'down':
        await down({ root: io.cwd, infra: await infrastructure(io), out: io.stdout })
        return 0
      case 'agent':
        return await agent({ root: io.cwd, args: argv.slice(1), out: io.stderr })
      case 'worker': {
        const [mode = '', ...options] = argv.slice(1)
        const [flag, compute] = options
        if (options.length > 0 && (flag !== '--compute' || compute === undefined || options.length > 2)) {
          throw new Refusal(
            'UNKNOWN_WORKER_MODE',
            `${options.join(' ')}; the modes are real [--compute <fingerprint>] and fake`,
          )
        }
        await worker({
          root: io.cwd,
          infra: await infrastructure(io),
          mode,
          ...(compute === undefined ? {} : { compute }),
          out: io.stdout,
        })
        return 0
      }
      case 'e2e':
        await e2e({ root: io.cwd, infra: await infrastructure(io), scenario: argv[1] ?? '', out: io.stdout })
        return 0
      case 'url':
        url({ root: io.cwd, out: io.stdout })
        return 0
      default:
        throw new Refusal('UNKNOWN_COMMAND', `${command}; the commands are up, down, worker, e2e, url, agent`)
    }
  } catch (error) {
    if (error instanceof Refusal) {
      io.stderr(`${error.code}: ${error.message}`)
      return 1
    }
    io.stderr(error instanceof Error ? (error.stack ?? error.message) : String(error))
    return 2
  }
}

if (process.argv[1] === import.meta.filename) {
  process.exitCode = await run(process.argv.slice(2), {
    cwd: process.cwd(),
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  })
}
