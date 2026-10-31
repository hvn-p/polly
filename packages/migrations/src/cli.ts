// The migrations' command line, run by dev:up on a worktree's database and by
// the deployment, from its build: `node packages/migrations/dist/cli.js
// migrate`, with DATABASE_URL set. The tests' setups call migrate() directly.

import { environment, Refusal, readConfigOf } from '@polly/platform'
import { connect } from './connect.ts'
import { migrate } from './migrate.ts'

const COMMANDS = ['migrate']

export interface CliIo {
  env: Record<string, string | undefined>
  out: (line: string) => void
  err: (line: string) => void
}

export async function runCli(argv: readonly string[], { env, out, err }: CliIo): Promise<number> {
  const [command = ''] = argv
  if (!COMMANDS.includes(command)) {
    err(`UNKNOWN_COMMAND: ${command}; the commands are ${COMMANDS.join(', ')}`)
    return 1
  }
  let url: string
  try {
    url = readConfigOf(env, ['DATABASE_URL']).DATABASE_URL
  } catch (error) {
    if (error instanceof Refusal) {
      err(error.text)
      return 1
    }
    throw error
  }
  const db = connect(url)
  try {
    const applied = await migrate(db)
    out(applied.length === 0 ? 'migrations: up to date' : `migrations applied: ${applied.join(', ')}`)
    return 0
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] === import.meta.filename) {
  process.exitCode = await runCli(process.argv.slice(2), {
    env: environment(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  })
}
