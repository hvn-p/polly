import { type LogRecord, plugLogSink, Refusal, type WithTrace } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { type Guards, type Route, RouteRegistry } from './routes.ts'

// Each request runs inside the trace its traceparent names; these record it.
const traced: string[] = []
const quiet: WithTrace = (incoming, run) => {
  traced.push(incoming ?? 'none')
  return run()
}

function capture(): LogRecord[] {
  const records: LogRecord[] = []
  plugLogSink({ write: (record) => records.push(record) })
  return records
}

const guards: Guards = {
  public: async () => ({}),
  learner: async (request) => {
    if (request.headers.get('authorization') !== 'Bearer ok') {
      throw new Refusal('UNAUTHORIZED', 'no token')
    }
    return { learnerId: 'learner-1' }
  },
  'event-code': async () => {
    throw new Refusal('UNAUTHORIZED', 'no code')
  },
}

describe('route registry', () => {
  it('cannot register a route without an access rule (type guard)', () => {
    const registry = new RouteRegistry(guards)
    // @ts-expect-error a route must declare its access rule
    const withoutAccess: Route = { method: 'GET', path: '/x', handle: () => new Response('x') }
    const unknownAccess: Route = {
      method: 'GET',
      path: '/x',
      // @ts-expect-error the access rule comes from a closed set
      access: 'admin',
      handle: () => new Response('x'),
    }
    expect(() => registry.add(withoutAccess)).toThrow(/access/)
    expect(() => registry.add(unknownAccess)).toThrow(/access/)
  })

  it('serves a route through its access rule, which can refuse it', async () => {
    const registry = new RouteRegistry(guards)
      .add({ method: 'GET', path: '/api/open', access: 'public', handle: () => new Response('open') })
      .add({
        method: 'GET',
        path: '/api/mine',
        access: 'learner',
        handle: (_request, { learnerId }) => new Response(learnerId),
      })
    const app = createApp(registry, quiet)
    expect(await (await app.request('/api/open')).text()).toBe('open')
    const refused = await app.request('/api/mine')
    expect(refused.status).toBe(401)
    expect(await refused.json()).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await (await app.request('/api/mine', { headers: { authorization: 'Bearer ok' } })).text()).toBe(
      'learner-1',
    )
  })

  it('answers a refusal a route throws with its HTTP translation, and any other error with no body', async () => {
    const registry = new RouteRegistry(guards)
      .add({
        method: 'GET',
        path: '/api/revoked',
        access: 'public',
        handle: () => {
          throw new Refusal('EVENT_CODE_REVOKED', 'revoked')
        },
      })
      .add({
        method: 'GET',
        path: '/api/broken',
        access: 'public',
        handle: () => {
          throw new Error('broken')
        },
      })
    const app = createApp(registry, quiet)
    const refused = await app.request('/api/revoked')
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ code: 'EVENT_CODE_REVOKED' })
    const broken = await app.request('/api/broken')
    expect(broken.status).toBe(500)
    expect(await broken.text()).toBe('')
  })

  it('logs each request once, inside its trace: served, or failed with its error', async () => {
    const records = capture()
    traced.length = 0
    const registry = new RouteRegistry(guards)
      .add({ method: 'GET', path: '/api/open', access: 'public', handle: () => new Response('open') })
      .add({
        method: 'GET',
        path: '/api/broken',
        access: 'public',
        handle: () => {
          throw new Error('broken')
        },
      })
    const app = createApp(registry, quiet)
    await app.request('/api/open?secret=1', { headers: { traceparent: 'incoming' } })
    await app.request('/api/mine')
    await app.request('/api/broken')
    expect(traced).toEqual(['incoming', 'none', 'none'])
    expect(records.map(({ event, fields }) => ({ event: event.name, fields }))).toEqual([
      {
        event: 'api.request.served',
        fields: { method: 'GET', path: '/api/open', status: 200, ms: expect.any(Number) },
      },
      {
        event: 'api.request.served',
        fields: { method: 'GET', path: '/api/mine', status: 404, ms: expect.any(Number) },
      },
      {
        event: 'api.request.failed',
        fields: {
          method: 'GET',
          path: '/api/broken',
          status: 500,
          ms: expect.any(Number),
          error: new Error('broken'),
        },
      },
    ])
    expect(records[0]?.source).toEqual({
      tier: 'interfaces',
      module: 'apps/api/src',
      file: 'apps/api/src/app.ts',
    })
  })

  it('denies by default: an unregistered path answers 404, with no code outside the contract', async () => {
    const app = createApp(new RouteRegistry(guards), quiet)
    const response = await app.request('/api/anything')
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })

  it('lists the registered routes with their access rule, for the route walk', () => {
    const registry = new RouteRegistry(guards).add({
      method: 'POST',
      path: '/mcp',
      access: 'learner',
      handle: () => new Response(),
    })
    expect(registry.routes().map(({ method, path, access }) => ({ method, path, access }))).toEqual([
      { method: 'POST', path: '/mcp', access: 'learner' },
    ])
  })
})
