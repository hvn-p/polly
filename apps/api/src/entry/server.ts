// The API's routes over HTTP, built from the ports its composition root
// (main.ts) hands it, and served on its listen address.

import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import type { EventCodeStore } from '@polly/back'
import type { Clock, Logger } from '@polly/platform'
import { type Authenticate, learnerGuard } from './access.ts'
import { eventCodeGuard, registerAgentEventRoute } from './agent-events/index.ts'
import { createApp } from './app.ts'
import { registerAuthRoutes } from './auth.ts'
import { ownOrigin } from './listen.ts'
import { registerMcpRoute } from './mcp/index.ts'
import { startLesson } from './mcp/start-lesson.ts'
import { whoami } from './mcp/whoami.ts'
import { type Guards, type Route, RouteRegistry } from './routes.ts'

export interface ApiPorts {
  codes: EventCodeStore
  // The identity's routes: sign-in, OAuth, discovery.
  identityHandler: (request: Request) => Promise<Response>
  // Which learner makes an MCP request, given where the server's keys are read.
  mcpLearner: (jwksUrl: () => string) => Authenticate
  clock: Clock
  log: Logger
}

export interface RunningServer {
  // The origin the server answers on, read back on loopback when it listens
  // on every interface.
  url: string
  // The registered routes, for the route walk.
  routes: readonly Route[]
  close: () => Promise<void>
}

export async function serveApi(
  { hostname, port }: { hostname: string; port: number },
  ports: ApiPorts,
): Promise<RunningServer> {
  let listeningPort = port
  const guards: Guards = {
    public: async () => ({}),
    // The keys are read on the address the server listens on, never through
    // the worktree's public URL.
    learner: learnerGuard(ports.mcpLearner(() => `${ownOrigin(hostname, listeningPort)}/api/auth/jwks`)),
    'event-code': eventCodeGuard(ports.codes),
  }
  const registry = new RouteRegistry(guards)
  registerAuthRoutes(registry, ports.identityHandler)
  registerMcpRoute(registry, [whoami, startLesson(ports.codes)])
  registerAgentEventRoute(registry, ports.codes, ports.clock)
  const app = createApp(registry, ports.log)
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const listening = serve({ fetch: app.fetch, hostname, port }, () => resolve(listening))
  })
  listeningPort = (server.address() as AddressInfo).port
  return {
    url: ownOrigin(hostname, listeningPort),
    routes: registry.routes(),
    close: () =>
      new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}
