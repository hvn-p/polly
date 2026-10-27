import { describe, expect, it } from 'vitest'
import { Refusal } from '../kernel/refusal/index.ts'
import { createApp } from './app.ts'
import { type Guards, type Route, RouteRegistry } from './routes.ts'

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
    const app = createApp(registry)
    expect(await (await app.request('/api/open')).text()).toBe('open')
    const refused = await app.request('/api/mine')
    expect(refused.status).toBe(401)
    expect(await refused.json()).toEqual({ code: 'UNAUTHORIZED' })
    expect(await (await app.request('/api/mine', { headers: { authorization: 'Bearer ok' } })).text()).toBe(
      'learner-1',
    )
  })

  it('answers a refusal a route throws with its HTTP translation, and lets any other error through', async () => {
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
    const app = createApp(registry)
    const refused = await app.request('/api/revoked')
    expect(refused.status).toBe(403)
    expect(await refused.json()).toEqual({ code: 'EVENT_CODE_REVOKED' })
    expect((await app.request('/api/broken')).status).toBe(500)
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
