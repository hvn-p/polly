// The API's command line, run by dev:up on a worktree's database once it is
// migrated: `node apps/api/src/entry/cli.ts seed-demo`.

import { fetchClientMetadataResource } from '@better-auth/cimd/node'
import { DEMO_ACCOUNT, seedDemoAccount } from '@polly/back'
import { connect } from '@polly/database'
import { Refusal, readConfig } from '@polly/platform'
import { createIdentity, learnerAccounts } from '../reference/identity/index.ts'
import { configureLogging, logger } from './logger.ts'

const COMMANDS = ['seed-demo']

// What the command prints as its result; its refusals go to the log.
export interface CliIo {
  env: Record<string, string | undefined>
  out: (line: string) => void
}

const log = logger('cli')

function refuse(code: string, reason: string): number {
  log.error('{code}: {reason}', { code, reason })
  return 1
}

export async function runCli(argv: readonly string[], { env, out }: CliIo): Promise<number> {
  const [command = ''] = argv
  if (!COMMANDS.includes(command)) {
    return refuse('UNKNOWN_COMMAND', `${command}; the commands are ${COMMANDS.join(', ')}`)
  }
  let config: ReturnType<typeof readConfig>
  try {
    config = readConfig(env)
  } catch (error) {
    return refuse('INVALID_CONFIGURATION', error instanceof Error ? error.message : String(error))
  }
  const db = connect(config.DATABASE_URL)
  try {
    const identity = createIdentity({
      publicUrl: config.PUBLIC_URL,
      secret: config.BETTER_AUTH_SECRET,
      db,
      fetchClientMetadataResource,
    })
    await seedDemoAccount({ accounts: learnerAccounts(identity), environment: config.POLLY_ENV })
    out(`demo account: ${DEMO_ACCOUNT.email}`)
    return 0
  } catch (error) {
    if (error instanceof Refusal) {
      log.error('{message}', { code: error.code, message: error.message })
      return 1
    }
    throw error
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] === import.meta.filename) {
  await configureLogging()
  process.exitCode = await runCli(process.argv.slice(2), {
    env: process.env,
    out: (line) => console.log(line),
  })
}
