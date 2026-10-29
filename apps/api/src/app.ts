import type { Logger } from '@polly/platform'
import { Hono } from 'hono'
import { notFoundResponse } from './refusals.ts'
import type { RouteRegistry } from './routes.ts'

// The HTTP application: only the registry's routes, each behind its access
// rule. Anything else is not found. Each request is logged with identifiers
// only: its method, its path without the query string, its status and its
// time, never a header or a body.
export function createApp(registry: RouteRegistry, log: Logger): Hono {
  const app = new Hono()
  const requests = log.child({ module: 'http' })
  app.use(async (context, next) => {
    const started = performance.now()
    await next()
    requests.info('request', {
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
      ms: Math.round(performance.now() - started),
    })
  })
  for (const route of registry.routes()) {
    const handle = registry.handler(route)
    app.on(route.method, route.path, (context) => handle(context.req.raw))
  }
  app.notFound(() => notFoundResponse())
  return app
}
