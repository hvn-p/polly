import { createHash, randomBytes } from 'node:crypto'
import { apiResource, createLearnerAccount, mcpResource, TOKEN_EXCHANGE_GRANT } from '@polly/identity'
import { expect } from 'vitest'
import type { TestServer } from './server.ts'

const REDIRECT_URI = 'http://127.0.0.1:9/callback'

export function uniqueEmail(label: string): string {
  return `${label}-${randomBytes(4).toString('hex')}@polly.localhost`
}

export async function createLearner(server: TestServer, label = 'learner') {
  const email = uniqueEmail(label)
  const password = `password-${randomBytes(6).toString('hex')}`
  const learnerId = await createLearnerAccount(server.identity, { name: label, email, password })
  return { learnerId, email, password }
}

// Every request comes from the worktree's origin, as through the front end.
export function headers(server: TestServer, extra: Record<string, string> = {}): Record<string, string> {
  return { origin: server.config.PUBLIC_URL, ...extra }
}

export async function signIn(server: TestServer, email: string, password: string): Promise<Response> {
  return fetch(`${server.url}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: headers(server, { 'content-type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  })
}

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

// A public client created on the server side, bound to the MCP resource, by
// the signed-in learner whose session cookie is given.
export async function createPublicClient(server: TestServer, cookie: string): Promise<string> {
  const client = (await server.identity.api.adminCreateOAuthClient({
    headers: new Headers({ cookie }),
    body: {
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: 'none',
      // A native client redirects to loopback, as Claude Code does.
      application_type: 'native',
      resources: [mcpResource(server.config.PUBLIC_URL)],
      skip_consent: false,
    },
  })) as { client_id: string }
  return client.client_id
}

// The real flow over HTTP: sign-in, authorize with PKCE and the resource,
// consent, token exchange. Returns the MCP access token.
export async function mcpAccessToken(server: TestServer, email: string, password: string): Promise<string> {
  const signedIn = await signIn(server, email, password)
  expect(signedIn.status).toBe(200)
  const cookie = cookiesOf(signedIn)
  const clientId = await createPublicClient(server, cookie)
  const verifier = randomBytes(32).toString('base64url')
  const resource = mcpResource(server.config.PUBLIC_URL)
  const authorize = new URL(`${server.url}/api/auth/oauth2/authorize`)
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'openid',
    state: 'state',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    resource,
  })) {
    authorize.searchParams.set(key, value)
  }
  const consentRedirect = await fetch(authorize, { headers: headers(server, { cookie }), redirect: 'manual' })
  // A browser is redirected; a script gets the redirect as JSON.
  const location =
    consentRedirect.headers.get('location') ?? ((await consentRedirect.json()) as { url: string }).url
  const consentPage = new URL(location, server.config.PUBLIC_URL)
  expect(consentPage.pathname).toBe('/consent')
  const consent = await fetch(`${server.url}/api/auth/oauth2/consent`, {
    method: 'POST',
    headers: headers(server, { cookie, 'content-type': 'application/json' }),
    body: JSON.stringify({ accept: true, oauth_query: consentPage.search.slice(1) }),
  })
  const { url } = (await consent.json()) as { url: string }
  const code = new URL(url).searchParams.get('code') ?? ''
  const token = await fetch(`${server.url}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: headers(server, { 'content-type': 'application/x-www-form-urlencoded' }),
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
      resource,
    }),
  })
  const body = (await token.json()) as { access_token?: string }
  expect(body.access_token).toBeTypeOf('string')
  return body.access_token ?? ''
}

// The MCP server's confidential client, created on the server side by the
// signed-in learner whose session cookie is given: it may exchange tokens for
// the API.
export async function createConfidentialClient(
  server: TestServer,
  cookie: string,
): Promise<{ clientId: string; clientSecret: string }> {
  const client = (await server.identity.api.adminCreateOAuthClient({
    headers: new Headers({ cookie }),
    body: {
      // It never redirects: it only exchanges tokens.
      redirect_uris: [`${server.config.PUBLIC_URL}/mcp/unused`],
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: [TOKEN_EXCHANGE_GRANT],
      resources: [apiResource(server.config.PUBLIC_URL)],
      skip_consent: true,
    },
  })) as { client_id: string; client_secret: string }
  return { clientId: client.client_id, clientSecret: client.client_secret }
}

export async function signedInCookie(server: TestServer, email: string, password: string): Promise<string> {
  return cookiesOf(await signIn(server, email, password))
}

// RFC 8693 at the standard token endpoint: the subject token for a token
// naming the API as its audience.
export function exchangeToken(
  server: TestServer,
  { clientId, clientSecret, subjectToken }: { clientId: string; clientSecret: string; subjectToken: string },
): Promise<Response> {
  return fetch(`${server.url}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: headers(server, { 'content-type': 'application/x-www-form-urlencoded' }),
    body: new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      client_id: clientId,
      client_secret: clientSecret,
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      resource: apiResource(server.config.PUBLIC_URL),
    }),
  })
}

// A JWT's claims, unverified: what the test reads of a token it was issued.
export function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>
}
