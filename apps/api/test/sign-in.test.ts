import { createHash, randomBytes } from 'node:crypto'
import { browserSessions, type Identity, mcpResource, SIGN_IN_BOUNDS } from '@polly/identity'
import { describe, expect, it } from 'vitest'
import { signInRequest } from '../src/contracts/api.ts'
import { createLearner, createPublicClient, headers, signedInCookie } from './support/oauth.ts'
import { testServer } from './support/server.ts'

const server = await testServer()

function post(path: string, body: unknown, extra: Record<string, string> = {}): Promise<Response> {
  return fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: headers(server, { 'content-type': 'application/json', ...extra }),
    body: JSON.stringify(body),
  })
}

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

// An agent's authorization request, as the identity sends a signed-out learner
// to the sign-in page: the query string that page receives.
async function signInPageQuery(): Promise<string> {
  const owner = await createLearner(server, 'owner')
  const clientId = await createPublicClient(server, await signedInCookie(server, owner.email, owner.password))
  const authorize = new URL(`${server.url}/api/auth/oauth2/authorize`)
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'http://127.0.0.1:9/callback',
    scope: 'openid',
    state: 'state',
    code_challenge: createHash('sha256').update(randomBytes(32).toString('base64url')).digest('base64url'),
    code_challenge_method: 'S256',
    resource: mcpResource(server.config.PUBLIC_URL),
  })) {
    authorize.searchParams.set(key, value)
  }
  const redirect = await fetch(authorize, { headers: headers(server), redirect: 'manual' })
  const location = redirect.headers.get('location') ?? ((await redirect.json()) as { url: string }).url
  const page = new URL(location, server.config.PUBLIC_URL)
  expect(page.pathname).toBe('/sign-in')
  return page.search.slice(1)
}

describe('POST /api/sign-in', () => {
  it('signs the learner in, setting the host-only secure session cookie, with nowhere to go next', async () => {
    const { email, password } = await createLearner(server)
    const response = await post('/api/sign-in', { email, password })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    const session = response.headers.getSetCookie().find((cookie) => cookie.includes('session_token='))
    expect(session).toMatch(/^__Secure-/)
    expect(session).toMatch(/;\s*Secure/i)
    expect(session).toMatch(/;\s*HttpOnly/i)
    expect(session).not.toMatch(/;\s*Domain=/i)
  })

  it("checks the contract's bounds: the identity's copy of them is the contract's", () => {
    const { email, password } = signInRequest.shape
    expect(SIGN_IN_BOUNDS).toEqual({
      email: { max: email.maxLength },
      password: { min: password.minLength, max: password.maxLength },
    })
  })

  it('C22: refuses a wrong password, and a pair out of bounds, with INVALID_EMAIL_OR_PASSWORD', async () => {
    const { email, password } = await createLearner(server)
    for (const attempt of [
      { email, password: 'wrong-password' },
      { email: `${'a'.repeat(250)}@x.io`, password },
      { email, password: 'x'.repeat(7) },
      { email, password: 'x'.repeat(129) },
      { email, password, oauthQuery: 'q'.repeat(4097) },
    ]) {
      const response = await post('/api/sign-in', attempt)
      expect(response.status).toBe(401)
      expect(await response.json()).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' })
      expect(response.headers.getSetCookie()).toEqual([])
    }
  })

  it('resumes a pending authorization request: next is the consent page', async () => {
    const oauthQuery = await signInPageQuery()
    const { email, password } = await createLearner(server)
    const response = await post('/api/sign-in', { email, password, oauthQuery })
    const { next } = (await response.json()) as { next: string }
    expect(new URL(next, server.config.PUBLIC_URL).pathname).toBe('/consent')
  })

  it('resumes it when the page received parameters the identity did not sign', async () => {
    const oauthQuery = `${await signInPageQuery()}&utm_source=mail`
    const { email, password } = await createLearner(server)
    const response = await post('/api/sign-in', { email, password, oauthQuery })
    expect(response.status).toBe(200)
    const { next } = (await response.json()) as { next: string }
    expect(new URL(next, server.config.PUBLIC_URL).pathname).toBe('/consent')
  })

  it('refuses an altered authorization request with INVALID_OAUTH_REQUEST, even with the right password', async () => {
    const altered = (await signInPageQuery()).replace(/state=[^&]*/, 'state=other')
    const { email, password } = await createLearner(server)
    const response = await post('/api/sign-in', { email, password, oauthQuery: altered })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_OAUTH_REQUEST' })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('answers any other refusal of the identity as an unexpected failure, which the API answers 500 and logs', async () => {
    // An identity refusing for another reason than the learner's: its origin
    // check, its rate limit.
    for (const status of [403, 429]) {
      const identity = { handler: async () => Response.json({}, { status }) } as unknown as Identity
      const sessions = browserSessions(identity, server.config.PUBLIC_URL)
      await expect(sessions.signIn({ email: 'a@b.io', password: 'password' }, new Headers())).rejects.toThrow(
        `the identity answered ${status} to a sign-in`,
      )
    }
  })
})

describe('POST /api/consent', () => {
  async function consentPage() {
    const signInQuery = await signInPageQuery()
    const { email, password } = await createLearner(server)
    const signedIn = await post('/api/sign-in', { email, password, oauthQuery: signInQuery })
    const { next } = (await signedIn.json()) as { next: string }
    return { cookie: cookieOf(signedIn), oauthQuery: new URL(next, server.config.PUBLIC_URL).search.slice(1) }
  }

  it("records the learner's consent and sends them to the client's callback with a code", async () => {
    const { cookie, oauthQuery } = await consentPage()
    const response = await post('/api/consent', { accept: true, oauthQuery }, { cookie })
    expect(response.status).toBe(200)
    const { next } = (await response.json()) as { next: string }
    expect(new URL(next).origin).toBe('http://127.0.0.1:9')
    expect(new URL(next).searchParams.get('code')).toMatch(/.+/)
  })

  it('sends a denial to the callback too', async () => {
    const { cookie, oauthQuery } = await consentPage()
    const response = await post('/api/consent', { accept: false, oauthQuery }, { cookie })
    const { next } = (await response.json()) as { next: string }
    expect(new URL(next).searchParams.get('error')).toBe('access_denied')
  })

  it('refuses without a session, and from another origin, with UNAUTHORIZED', async () => {
    const { cookie, oauthQuery } = await consentPage()
    const anonymous = await post('/api/consent', { accept: true, oauthQuery })
    expect(anonymous.status).toBe(401)
    const foreign = await post(
      '/api/consent',
      { accept: true, oauthQuery },
      { cookie, origin: 'https://evil.test' },
    )
    expect(foreign.status).toBe(401)
    expect(await foreign.json()).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('refuses an altered authorization request with INVALID_OAUTH_REQUEST', async () => {
    const { cookie, oauthQuery } = await consentPage()
    const altered = oauthQuery.replace(/state=[^&]*/, 'state=other')
    const response = await post('/api/consent', { accept: true, oauthQuery: altered }, { cookie })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_OAUTH_REQUEST' })
  })

  it('completes it when the page received parameters the identity did not sign', async () => {
    const { cookie, oauthQuery } = await consentPage()
    const response = await post(
      '/api/consent',
      { accept: true, oauthQuery: `${oauthQuery}&utm_source=mail` },
      { cookie },
    )
    expect(response.status).toBe(200)
    const { next } = (await response.json()) as { next: string }
    expect(new URL(next).searchParams.get('code')).toEqual(expect.any(String))
  })
})

describe('GET /api/me with the session cookie', () => {
  it('names the signed-in learner, as the home page shows them', async () => {
    const { email, password, learnerId } = await createLearner(server, 'home')
    const cookie = cookieOf(await post('/api/sign-in', { email, password }))
    const me = await fetch(`${server.url}/api/me`, { headers: headers(server, { cookie }) })
    expect(await me.json()).toEqual({ learnerId, name: 'home' })
  })
})
