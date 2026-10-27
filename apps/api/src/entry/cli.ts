// The API's command line, run by dev:up on a worktree's database:
// `node apps/api/src/entry/cli.ts migrate|seed-demo`.

import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { DEMO_ACCOUNT, seedDemoAccount } from '../flows/seed-demo-account/index.ts'
import { Refusal } from '../kernel/refusal/index.ts'
import { createIdentity } from '../reference/identity/index.ts'
import { readConfig } from './config.ts'
import { createDatabase } from './database.ts'
import { migrate } from './startup.ts'

const COMMANDS = ['migrate', 'seed-demo']

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
  let config: ReturnType<typeof readConfig>
  try {
    config = readConfig(env)
  } catch (error) {
    err(`INVALID_CONFIGURATION: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
  const db = createDatabase(config.DATABASE_URL)
  try {
    if (command === 'migrate') {
      const applied = await migrate(db)
      out(applied.length === 0 ? 'migrations: up to date' : `migrations applied: ${applied.join(', ')}`)
      return 0
    }
    const identity = createIdentity({
      publicUrl: config.PUBLIC_URL,
      secret: config.BETTER_AUTH_SECRET,
      db,
      fetchClientMetadataResource,
    })
    await seedDemoAccount({ environment: config.POLLY_ENV, identity })
    out(`demo account: ${DEMO_ACCOUNT.email}`)
    return 0
  } catch (error) {
    if (error instanceof Refusal) {
      err(error.message)
      return 1
    }
    throw error
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
