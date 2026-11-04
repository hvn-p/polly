// The API's command line, run by dev:up on a worktree's database once it is
// migrated, from its build: `node apps/api/dist/cli.js seed-demo`. Built in a
// checkout only and never deployed, so the demo account stays out of every
// deployed bundle.

import { DEMO_ACCOUNT, seedDemoAccount } from '@polly/back'
import { connect } from '@polly/database'
import { createIdentity, learnerAccounts } from '@polly/identity'
import { createLogSink } from '@polly/logging'
import { environment, plugLogSink, Refusal, readConfig } from '@polly/platform'
import { log } from '@polly/platform/log'
import { COMMAND_REFUSED } from './events.ts'

const COMMANDS = ['seed-demo']

// What the command prints as its result; its refusals go to the log.
export interface CliIo {
  env: Record<string, string | undefined>
  out: (line: string) => void
}

export async function runCli(argv: readonly string[], { env, out }: CliIo): Promise<number> {
  const refuse = (code: string, reason: string): number => {
    log(COMMAND_REFUSED, { code, reason })
    return 1
  }
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
    })
    await seedDemoAccount({ accounts: learnerAccounts(identity), environment: config.POLLY_ENV })
    out(`demo account: ${DEMO_ACCOUNT.email}`)
    return 0
  } catch (error) {
    if (error instanceof Refusal) {
      return refuse(error.code, error.message)
    }
    throw error
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] === import.meta.filename) {
  plugLogSink(createLogSink({ name: 'polly-api-cli' }))
  process.exitCode = await runCli(process.argv.slice(2), {
    env: environment(),
    out: (line) => console.log(line),
  })
}
