import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { type Guards, type Route, RouteRegistry } from './routes.ts'

const guards: Guards = {
  public: async () => ({}),
  learner: async (request) =>
    request.headers.get('authorization') === 'Bearer ok'
      ? { learnerId: 'learner-1' }
      : Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }),
  'event-code': async () => Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }),
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
    const app = createApp(registry)
    expect(await (await app.request('/api/open')).text()).toBe('open')
    const refused = await app.request('/api/mine')
    expect(refused.status).toBe(401)
    expect(await refused.json()).toEqual({ code: 'UNAUTHORIZED' })
    expect(await (await app.request('/api/mine', { headers: { authorization: 'Bearer ok' } })).text()).toBe(
      'learner-1',
    )
  })

  it('denies by default: an unregistered path answers 404', async () => {
    const app = createApp(new RouteRegistry(guards))
    const response = await app.request('/api/anything')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: 'NOT_FOUND' })
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
