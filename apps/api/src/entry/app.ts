import { honoLogger } from '@logtape/hono'
import { Hono } from 'hono'
import { Refusal } from '../kernel/refusal/index.ts'
import { refusalResponse } from './refusals.ts'
import type { RouteRegistry } from './routes.ts'

// The HTTP application: only the registry's routes, each behind its access
// rule. Anything else is not found. Each request is logged with identifiers
// only: never its query string, a header or a body.
export function createApp(registry: RouteRegistry): Hono {
  const app = new Hono()
  app.use(
    honoLogger({
      category: ['polly', 'http'],
      format: (context, responseTime) => ({
        method: context.req.method,
        // The path alone, never its query string; named as the line's
        // message reads it.
        url: context.req.path,
        status: context.res.status,
        responseTime,
      }),
    }),
  )
  for (const route of registry.routes()) {
    const handle = registry.handler(route)
    app.on(route.method, route.path, (context) => handle(context.req.raw))
  }
  app.notFound((context) => refusalResponse(new Refusal('NOT_FOUND', `no route for ${context.req.path}`)))
  return app
}
