// The database's command line, run by dev:up on a worktree's database:
// `node packages/database/src/cli.ts migrate`, with DATABASE_URL set.

import { connect } from './index.ts'
import { migrate } from './migrator.ts'

const COMMANDS = ['migrate']

export interface CliIo {
  env: Record<string, string | undefined>
  out: (line: string) => void
  err: (line: string) => void
}

function databaseUrl(env: CliIo['env']): string | undefined {
  try {
    const url = new URL(env['DATABASE_URL'] ?? '')
    return /^postgres(ql)?:$/.test(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}

export async function runCli(argv: readonly string[], { env, out, err }: CliIo): Promise<number> {
  const [command = ''] = argv
  if (!COMMANDS.includes(command)) {
    err(`UNKNOWN_COMMAND: ${command}; the commands are ${COMMANDS.join(', ')}`)
    return 1
  }
  const url = databaseUrl(env)
  if (url === undefined) {
    err('INVALID_CONFIGURATION: DATABASE_URL is not a postgresql:// URL')
    return 1
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
    env: process.env,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  })
}
