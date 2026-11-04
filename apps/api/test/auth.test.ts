import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { createLearner, headers, mcpAccessToken, signIn, uniqueEmail } from './support/oauth.ts'
import { testServer } from './support/server.ts'

const server = await testServer()

describe('sign-in and the OAuth flow', () => {
  it('a learner signs in, then authorizes with PKCE and exchanges the code for an MCP token', async () => {
    const { email, password } = await createLearner(server)
    const token = await mcpAccessToken(server, email, password)
    const [, payload = ''] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { aud: string | string[] }
    expect([claims.aud].flat()).toContain(`${server.config.PUBLIC_URL}/mcp`)
  })

  it('C22: refuses a wrong password with INVALID_EMAIL_OR_PASSWORD', async () => {
    const { email } = await createLearner(server)
    const response = await signIn(server, email, 'wrong-password')
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' })
  })

  it('refuses an email over 254 characters and a password outside 8 to 128', async () => {
    const { email, password } = await createLearner(server)
    const tooLong = `${'a'.repeat(60)}@${'b'.repeat(184)}.localhost`
    expect(tooLong).toHaveLength(255)
    const cases = [
      { email: tooLong, password, code: 'INVALID_EMAIL' },
      { email, password: 'x'.repeat(7), code: 'PASSWORD_TOO_SHORT' },
      { email, password: 'x'.repeat(129), code: 'PASSWORD_TOO_LONG' },
    ]
    for (const attempt of cases) {
      const response = await signIn(server, attempt.email, attempt.password)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: attempt.code })
    }
  })

  it('C25: the session cookie is host-only and secure, so worktrees keep separate sessions', async () => {
    const { email, password } = await createLearner(server)
    const cookies = (await signIn(server, email, password)).headers.getSetCookie()
    const session = cookies.find((cookie) => cookie.includes('session_token='))
    expect(session).toMatch(/^__Secure-/)
    expect(session).toMatch(/;\s*Secure/i)
    expect(session).not.toMatch(/;\s*Domain=/i)
  })

  it('C63: public sign-up is closed and creates no account', async () => {
    const email = uniqueEmail('signup')
    const response = await fetch(`${server.url}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: headers(server, { 'content-type': 'application/json' }),
      body: JSON.stringify({ name: 'x', email, password: 'password-123' }),
    })
    expect(response.ok).toBe(false)
    const { rows } = await sql<{
      count: number
    }>`select count(*)::int as count from "user" where email = ${email}`.execute(
      (await server.identity.$context).options.database.db,
    )
    expect(rows).toEqual([{ count: 0 }])
  })

  it('serves the OAuth discovery metadata on the worktree origin', async () => {
    const authorization = await fetch(`${server.url}/.well-known/oauth-authorization-server/api/auth`)
    expect(await authorization.json()).toMatchObject({ issuer: `${server.config.PUBLIC_URL}/api/auth` })
    const resource = await fetch(`${server.url}/.well-known/oauth-protected-resource/mcp`)
    expect(await resource.json()).toMatchObject({ resource: `${server.config.PUBLIC_URL}/mcp` })
  })
})
