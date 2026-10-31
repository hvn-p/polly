import { describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { type Guards, RouteRegistry } from '../routes.ts'
import { type BrowserSessions, registerSessionRoutes } from './index.ts'

const guards: Guards = {
  public: async () => ({}),
  learner: async () => ({ learnerId: 'learner-1' }),
  'event-code': async () => ({}),
}

// The session routes over an identity that records each call it receives.
function sessionRoutes() {
  const calls: string[] = []
  const sessions: BrowserSessions = {
    signIn: async () => {
      calls.push('signIn')
      return { cookies: [] }
    },
    consent: async () => {
      calls.push('consent')
      return { next: 'http://127.0.0.1:9/callback?code=x' }
    },
  }
  const registry = new RouteRegistry(guards)
  registerSessionRoutes(registry, sessions)
  return { calls, app: createApp(registry, (_incoming, run) => run()) }
}

describe('POST /api/consent', () => {
  it('refuses a body that breaks the contract with INVALID_OAUTH_REQUEST, never reaching the identity', async () => {
    const { calls, app } = sessionRoutes()
    for (const body of [
      JSON.stringify({ oauthQuery: 'sig=x' }),
      JSON.stringify({ accept: 'yes', oauthQuery: 'sig=x' }),
      JSON.stringify({ accept: true, oauthQuery: 'q'.repeat(4097) }),
      'accept=true',
    ]) {
      const response = await app.request('/api/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      expect({ body, status: response.status }).toEqual({ body, status: 400 })
      expect(await response.json()).toMatchObject({ code: 'INVALID_OAUTH_REQUEST' })
    }
    expect(calls).toEqual([])
    const accepted = await app.request('/api/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accept: true, oauthQuery: 'q'.repeat(4096) }),
    })
    expect(accepted.status).toBe(200)
    expect(calls).toEqual(['consent'])
  })
})
