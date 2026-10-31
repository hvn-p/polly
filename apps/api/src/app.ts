import type { WithTrace } from '@polly/platform'
import { log } from '@polly/platform/log'
import { Hono } from 'hono'
import { REQUEST_FAILED, REQUEST_SERVED } from './events.ts'
import { notFoundResponse, unexpectedResponse } from './refusals.ts'
import type { RouteRegistry } from './routes.ts'

// The HTTP application: only the registry's routes, each behind its access
// rule. Anything else is not found. Each request runs inside its trace and is
// logged once, with identifiers only: its method, its path without the query
// string, its status and its time, never a header or a body; an unexpected
// error is logged on that line, the one place that handles it.
export function createApp(registry: RouteRegistry, trace: WithTrace): Hono {
  const app = new Hono()
  app.use((context, next) =>
    trace(context.req.header('traceparent'), async () => {
      const started = performance.now()
      await next()
      const fields = {
        method: context.req.method,
        path: context.req.path,
        status: context.res.status,
        ms: Math.round(performance.now() - started),
      }
      if (context.error === undefined) {
        log(REQUEST_SERVED, fields)
      } else {
        log(REQUEST_FAILED, { ...fields, error: context.error })
      }
    }),
  )
  for (const route of registry.routes()) {
    const handle = registry.handler(route)
    app.on(route.method, route.path, (context) => handle(context.req.raw))
  }
  app.notFound(() => notFoundResponse())
  app.onError(() => unexpectedResponse())
  return app
}
