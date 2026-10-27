// Entry point of the dev commands: `node dev/src/main.ts <command> [args]`.
// A refusal prints `<CODE>: <message>` and exits 1; an unexpected failure
// exits 2.

import { agent } from './commands/agent.ts'
import { down } from './commands/down.ts'
import { e2e } from './commands/e2e.ts'
import { Refusal } from './commands/refusal.ts'
import { up } from './commands/up.ts'
import { url } from './commands/url.ts'
import { worker } from './commands/worker.ts'
import type { Infrastructure } from './infra/ports.ts'

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
  const { realInfrastructure } = await import('./infra/real.ts')
  return realInfrastructure()
}

export async function run(argv: readonly string[], io: Io): Promise<number> {
  const [command = ''] = argv
  try {
    switch (command) {
      case 'up':
        await up({ root: io.cwd, infra: await infrastructure(io), out: io.stdout })
        return 0
      case 'down':
        await down({ root: io.cwd, infra: await infrastructure(io), out: io.stdout })
        return 0
      case 'agent':
        return await agent({ root: io.cwd, args: argv.slice(1), out: io.stderr })
      case 'worker':
        await worker({ root: io.cwd, infra: await infrastructure(io), mode: argv[1] ?? '', out: io.stdout })
        return 0
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
