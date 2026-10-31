// The API's composition root: builds the adapters from the configuration and
// hands their ports to the routes. Run as a process, it serves the API on
// $POLLY_API_HOST:$POLLY_API_PORT: loopback locally, where the front-end dev
// server proxies the worktree's origin to it, every interface in a container.
// It serves nothing while the database is behind the code (SCHEMA_BEHIND), and
// starts once nr dev:up has migrated it.

import { assertSchemaCurrent, connect, PostgresStore, waitForSchema } from '@polly/database'
import {
  apiResource,
  authenticator,
  browserSessions,
  createIdentity,
  type IdentitySettings,
  learnerDirectory,
  registerMcpClient,
} from '@polly/identity'
import { runProcess, withTrace } from '@polly/logging'
import {
  type Clock,
  type Config,
  environment,
  readConfig,
  readConfigOf,
  systemClock,
  type WithTrace,
} from '@polly/platform'
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
  // Runs each request inside its trace: the logging capacity's.
  trace: WithTrace
}

export async function startServer({
  config,
  hostname,
  port,
  lastMigration,
  fetchClientMetadataResource,
  clock = systemClock,
  trace,
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
      sessions: browserSessions(identity, config.PUBLIC_URL),
      directory: learnerDirectory(identity),
      origin: new URL(config.PUBLIC_URL).origin,
      clock,
      trace,
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

if (process.argv[1] === import.meta.filename) {
  await runProcess({
    name: 'polly-api',
    start: async () => {
      const env = environment()
      const config = readConfig(env)
      const listen = readConfigOf(env, ['POLLY_API_HOST', 'POLLY_API_PORT'])
      await waitForSchema(config.DATABASE_URL, { retryMs: 2000 })
      const server = await startServer({
        config,
        hostname: listen.POLLY_API_HOST,
        port: listen.POLLY_API_PORT,
        trace: withTrace,
      })
      return { url: server.url }
    },
  })
}
