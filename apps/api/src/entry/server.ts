// The composition root: wires the API's parts from its configuration and
// serves them on loopback, once the database is known to match the code.

import type { AddressInfo } from 'node:net'
import { fetchClientMetadataResource as fetchOverNetwork } from '@better-auth/cimd/node'
import { serve } from '@hono/node-server'
import { assertSchemaCurrent, SchemaBehind } from '@polly/database'
import type { Migration } from 'kysely/migration'
import { type Clock, systemClock } from '../kernel/clock/index.ts'
import { createIdentity, type IdentitySettings } from '../reference/identity/index.ts'
import { learnerGuard } from './access.ts'
import { eventCodes } from './agent-events/codes.ts'
import { eventCodeGuard, registerAgentEventRoute } from './agent-events/index.ts'
import { createApp } from './app.ts'
import { registerAuthRoutes } from './auth.ts'
import type { Config } from './config.ts'
import { createDatabase } from './database.ts'
import { registerMcpRoute } from './mcp/index.ts'
import { startLesson } from './mcp/start-lesson.ts'
import { whoami } from './mcp/whoami.ts'
import { type Guards, type Route, RouteRegistry } from './routes.ts'

export interface ServerOptions {
  config: Config
  port: number
  migrations?: Record<string, Migration>
  // How a client's metadata document is fetched; tests inject one that never
  // reaches the network.
  fetchClientMetadataResource?: IdentitySettings['fetchClientMetadataResource']
  clock?: Clock
}

export interface RunningServer {
  // The loopback address the server listens on.
  url: string
  // The registered routes, for the route walk.
  routes: readonly Route[]
  close: () => Promise<void>
}

export async function startServer({
  config,
  port,
  migrations,
  fetchClientMetadataResource = fetchOverNetwork,
  clock = systemClock,
}: ServerOptions): Promise<RunningServer> {
  const db = createDatabase(config.DATABASE_URL)
  try {
    await assertSchemaCurrent(db, migrations)
  } catch (error) {
    await db.destroy()
    throw error
  }
  const identity = createIdentity({
    publicUrl: config.PUBLIC_URL,
    secret: config.BETTER_AUTH_SECRET,
    db,
    fetchClientMetadataResource,
  })
  let listeningPort = port
  const codes = eventCodes(db)
  const guards: Guards = {
    public: async () => ({}),
    learner: learnerGuard(
      identity,
      config.PUBLIC_URL,
      () => `http://127.0.0.1:${listeningPort}/api/auth/jwks`,
    ),
    'event-code': eventCodeGuard(codes),
  }
  const registry = new RouteRegistry(guards)
  registerAuthRoutes(registry, identity)
  registerMcpRoute(registry, [whoami, startLesson(codes)])
  registerAgentEventRoute(registry, codes, clock)
  const app = createApp(registry)
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const listening = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => resolve(listening))
  })
  listeningPort = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${listeningPort}`,
    routes: registry.routes(),
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
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
