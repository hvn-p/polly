// The API's command line, run by dev:up on a worktree's database:
// `node apps/api/src/entry/cli.ts migrate`.

import { readConfig } from './config.ts'
import { createDatabase } from './database.ts'
import { migrate } from './startup.ts'

export interface CliIo {
  env: Record<string, string | undefined>
  out: (line: string) => void
  err: (line: string) => void
}

export async function runCli(argv: readonly string[], { env, out, err }: CliIo): Promise<number> {
  const [command = ''] = argv
  if (command !== 'migrate') {
    err(`UNKNOWN_COMMAND: ${command}; the commands are migrate`)
    return 1
  }
  let config: ReturnType<typeof readConfig>
  try {
    config = readConfig(env)
  } catch (error) {
    err(`INVALID_CONFIGURATION: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  const db = createDatabase(config.DATABASE_URL)
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
