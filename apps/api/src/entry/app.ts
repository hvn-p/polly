import { Hono } from 'hono'
import { Refusal } from '../kernel/refusal/index.ts'
import { refusalResponse } from './refusals.ts'
import type { RouteRegistry } from './routes.ts'

// The HTTP application: only the registry's routes, each behind its access
// rule. Anything else is not found.
export function createApp(registry: RouteRegistry): Hono {
  const app = new Hono()
  for (const route of registry.routes()) {
    const handle = registry.handler(route)
    app.on(route.method, route.path, (context) => handle(context.req.raw))
  }
  app.notFound((context) => refusalResponse(new Refusal('NOT_FOUND', `no route for ${context.req.path}`)))
  return app
}
