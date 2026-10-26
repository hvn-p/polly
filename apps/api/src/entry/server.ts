// The composition root: wires the API's parts from its configuration and
// serves them on loopback, once the database is known to match the code.

import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import type { Migration } from 'kysely/migration'
import { createApp } from './app.ts'
import type { Config } from './config.ts'
import { createDatabase } from './database.ts'
import { type Guards, RouteRegistry } from './routes.ts'
import { assertSchemaCurrent } from './startup.ts'

export interface ServerOptions {
  config: Config
  port: number
  migrations?: Record<string, Migration>
}

export interface RunningServer {
  // The loopback address the server listens on.
  url: string
  close: () => Promise<void>
}

const unauthorized = async () => Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })

export async function startServer({ config, port, migrations }: ServerOptions): Promise<RunningServer> {
  const db = createDatabase(config.DATABASE_URL)
  try {
    await assertSchemaCurrent(db, migrations)
  } catch (error) {
    await db.destroy()
    throw error
  }
  const guards: Guards = {
    public: async () => ({}),
    learner: unauthorized,
    'event-code': unauthorized,
  }
  const app = createApp(new RouteRegistry(guards))
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const listening = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => resolve(listening))
  })
  const { port: actualPort } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${actualPort}`,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
      await db.destroy()
    },
  }
}
