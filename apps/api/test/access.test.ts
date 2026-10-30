import { describe, expect, it } from 'vitest'
import { refusal } from '../src/contracts/refusals.ts'
import { testServer } from './support/server.ts'

const server = await testServer({ POLLY_ENV: 'local' })

describe('route walk', () => {
  it('C23: every learner route refuses an anonymous request with UNAUTHORIZED, in the local environment', async () => {
    const learnerRoutes = server.routes.filter(({ access }) => access === 'learner')
    for (const { method, path } of learnerRoutes) {
      const response = await fetch(`${server.url}${path.replace('*', 'x')}`, {
        method: method === 'ALL' ? 'POST' : method,
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: method === 'GET' ? null : '{}',
      })
      expect({ path, status: response.status }).toEqual({ path, status: 401 })
      expect(response.headers.get('www-authenticate')).toMatch(/^Bearer .*resource_metadata=/)
      expect({ path, body: refusal.parse(await response.json()).code }).toEqual({
        path,
        body: 'UNAUTHORIZED',
      })
    }
  })

  it('C23: a token that is not one of the worktree is refused the same way', async () => {
    for (const { method, path } of server.routes.filter(({ access }) => access === 'learner')) {
      const response = await fetch(`${server.url}${path}`, {
        method: method === 'ALL' ? 'POST' : method,
        headers: { authorization: 'Bearer not-a-token', 'content-type': 'application/json' },
        body: method === 'GET' ? null : '{}',
      })
      expect(response.status).toBe(401)
      expect({ path, body: refusal.parse(await response.json()).code }).toEqual({
        path,
        body: 'UNAUTHORIZED',
      })
    }
  })

  it('lists the auth routes and the sign-in as public', () => {
    expect(server.routes.filter(({ access }) => access === 'public').map(({ path }) => path)).toEqual([
      '/api/auth/*',
      '/.well-known/*',
      '/api/sign-in',
    ])
  })
})
