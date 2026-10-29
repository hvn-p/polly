import { describe, expect, it } from 'vitest'
import { Refusal, RouteRegistry } from './index.ts'

interface Contexts {
  open: Record<never, never>
  member: { id: string }
}

function registry() {
  return new RouteRegistry<Contexts>(
    {
      open: async () => ({}),
      member: async (request) =>
        request.headers.get('authorization') === 'Bearer m'
          ? { id: 'm' }
          : new Response(null, { status: 401 }),
    },
    (refusal) => Response.json({ code: refusal.code }, { status: 409 }),
  )
}

describe('route registry', () => {
  it("refuses a route whose access rule is not one of the process's", () => {
    const route: Parameters<ReturnType<typeof registry>['add']>[0] = {
      method: 'GET',
      path: '/x',
      // @ts-expect-error the access rule comes from the process's closed set
      access: 'admin',
      handle: () => new Response(),
    }
    expect(() => registry().add(route)).toThrow('Route GET /x: access must be one of open, member')
  })

  it('runs the route once its rule lets the request through, with what the rule established', async () => {
    const routes = registry().add({
      method: 'GET',
      path: '/me',
      access: 'member',
      handle: (_request, { id }) => Response.json({ id }),
    })
    const [route] = routes.routes()
    if (route === undefined) {
      throw new Error('the route was not registered')
    }
    const handle = routes.handler(route)
    expect(
      await (await handle(new Request('http://x/me', { headers: { authorization: 'Bearer m' } }))).json(),
    ).toEqual({ id: 'm' })
    expect((await handle(new Request('http://x/me'))).status).toBe(401)
  })

  it("answers a refusal the route throws with the process's translation", async () => {
    const routes = registry().add({
      method: 'GET',
      path: '/x',
      access: 'open',
      handle: () => {
        throw new Refusal('TAKEN', 'already taken')
      },
    })
    const [route] = routes.routes()
    if (route === undefined) {
      throw new Error('the route was not registered')
    }
    const response = await routes.handler(route)(new Request('http://x/x'))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ code: 'TAKEN' })
  })
})
