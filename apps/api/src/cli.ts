// The API's command line, run by dev:up on a worktree's database once it is
// migrated, from its build: `node apps/api/dist/cli.js seed-demo`. Built in a
// checkout only and never deployed, so the demo account stays out of every
// deployed bundle.

import { DEMO_ACCOUNT, seedDemoAccount } from '@polly/back'
import { connect } from '@polly/database'
import { createIdentity, learnerAccounts } from '@polly/identity'
import { createLogger } from '@polly/logging'
import { environment, type Logger, Refusal, readConfig } from '@polly/platform'

const COMMANDS = ['seed-demo']

// What the command prints as its result; its refusals go to the log.
export interface CliIo {
  env: Record<string, string | undefined>
  out: (line: string) => void
  log: Logger
}

export async function runCli(argv: readonly string[], { env, out, log }: CliIo): Promise<number> {
  const refuse = (code: string, reason: string): number => {
    log.error(`${code}: ${reason}`, { code })
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
      log.error(error.text, { code: error.code })
      return 1
    }
    throw error
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] === import.meta.filename) {
  process.exitCode = await runCli(process.argv.slice(2), {
    env: environment(),
    out: (line) => console.log(line),
    log: createLogger({ name: 'polly-api-cli' }),
  })
}
