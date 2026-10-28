// The API's composition root: builds the adapters from the configuration and
// hands their ports to the routes. Run as a process, it serves the API on
// $POLLY_API_HOST:$POLLY_API_PORT: loopback locally, where the front-end dev
// server proxies the worktree's origin to it, every interface in a container.
// It serves nothing while the database is behind the code (SCHEMA_BEHIND), and
// starts once nr dev:up has migrated it.

import { isIP } from 'node:net'
import { assertSchemaCurrent, connect, PostgresStore, SchemaBehind } from '@polly/database'
import {
  apiResource,
  authenticator,
  createIdentity,
  type IdentitySettings,
  registerMcpClient,
} from '@polly/identity'
import { createLogger } from '@polly/logging'
import { type Clock, type Config, type Logger, readConfig, systemClock } from '@polly/platform'
import { type RunningServer, serveApi } from './server.ts'

export type { RunningServer } from './server.ts'

export interface ServerOptions {
  config: Config
  // The address to listen on: loopback locally, every interface in a container.
  hostname: string
  port: number
  // The last migration the database must hold; tests name one it lacks.
  lastMigration?: string
  // How a client's metadata document is fetched; tests inject one that never
  // reaches the network.
  fetchClientMetadataResource?: IdentitySettings['fetchClientMetadataResource']
  clock?: Clock
  log: Logger
}

export async function startServer({
  config,
  hostname,
  port,
  lastMigration,
  fetchClientMetadataResource,
  clock = systemClock,
  log,
}: ServerOptions): Promise<RunningServer> {
  const db = connect(config.DATABASE_URL)
  try {
    await assertSchemaCurrent(db, lastMigration)
  } catch (error) {
    await db.destroy()
    throw error
  }
  const identity = createIdentity({
    publicUrl: config.PUBLIC_URL,
    secret: config.BETTER_AUTH_SECRET,
    db,
    ...(fetchClientMetadataResource === undefined ? {} : { fetchClientMetadataResource }),
  })
  await registerMcpClient(identity, config.PUBLIC_URL, config.MCP_CLIENT_SECRET)
  const server = await serveApi(
    { hostname, port },
    {
      codes: new PostgresStore(db),
      identityHandler: (request) => identity.handler(request),
      learner: (jwksUrl) => authenticator(identity, apiResource(config.PUBLIC_URL), jwksUrl),
      clock,
      log,
    },
  )
  return {
    ...server,
    close: async () => {
      await server.close()
      await db.destroy()
    },
  }
}

// Starts the server once the database matches the code. While it is behind,
// nothing is served: the refusal is reported once, and the check runs again,
// so the server comes up by itself once dev:up has migrated.
export async function startWhenSchemaCurrent(
  options: ServerOptions & { retryMs: number; onBehind: (message: string) => void },
): Promise<RunningServer> {
  let reported = false
  for (;;) {
    try {
      return await startServer(options)
    } catch (error) {
      if (!(error instanceof SchemaBehind)) {
        throw error
      }
      if (!reported) {
        options.onBehind(error.message)
        reported = true
      }
      await new Promise((resolve) => setTimeout(resolve, options.retryMs))
    }
  }
}

if (process.argv[1] === import.meta.filename) {
  const log = createLogger({ name: 'polly-api' })
  const hostname = process.env['POLLY_API_HOST'] ?? ''
  const port = Number(process.env['POLLY_API_PORT'])
  const invalid = [
    ...(isIP(hostname) === 0 ? ['POLLY_API_HOST'] : []),
    ...(Number.isInteger(port) && port > 0 ? [] : ['POLLY_API_PORT']),
  ]
  if (invalid.length > 0) {
    log.error('INVALID_CONFIGURATION', { keys: invalid })
    process.exit(1)
  }
  try {
    const server = await startWhenSchemaCurrent({
      config: readConfig(process.env),
      hostname,
      port,
      retryMs: 2000,
      log,
      onBehind: (message) => log.warn(message),
    })
    log.info('API listening', { url: server.url })
  } catch (error) {
    log.error('the API stopped', { error })
    process.exit(1)
  }
}
