import { apiResource, authenticator } from '@polly/identity'
import { describe, expect, it } from 'vitest'
import { claimsOf, createLearner, exchangeToken, mcpAccessToken } from './support/oauth.ts'
import { testServer } from './support/server.ts'

const server = await testServer()

async function mcpToken() {
  const { learnerId, email, password } = await createLearner(server)
  return { learnerId, subjectToken: await mcpAccessToken(server, email, password) }
}

describe('token exchange', () => {
  it('C73: exchanges the MCP token for an API token naming the same learner, valid 5 minutes', async () => {
    const { learnerId, subjectToken } = await mcpToken()
    const response = await exchangeToken(server, { subjectToken })
    expect(response.status).toBe(200)
    const { access_token: token } = (await response.json()) as { access_token: string }
    const claims = claimsOf(token)
    expect(claims['sub']).toBe(learnerId)
    expect([claims['aud']].flat()).toEqual([apiResource(server.config.PUBLIC_URL)])
    expect(Number(claims['exp']) - Number(claims['iat'])).toBeLessThanOrEqual(300)
  })

  it('C73: refuses a wrong client secret, and a client other than the MCP server', async () => {
    const { subjectToken } = await mcpToken()
    for (const client of [{ clientSecret: 'wrong' }, { clientId: 'someone-else' }]) {
      const response = await exchangeToken(server, { ...client, subjectToken })
      // The secret travels in the body (client_secret_post): RFC 6749 answers 400.
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: 'invalid_client' })
    }
  })

  it('refuses a subject token that is not the MCP token', async () => {
    const { subjectToken } = await mcpToken()
    const exchanged = (await (await exchangeToken(server, { subjectToken })).json()) as {
      access_token: string
    }
    for (const token of [exchanged.access_token, 'not-a-token']) {
      const response = await exchangeToken(server, { subjectToken: token })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: 'invalid_grant' })
    }
  })

  it('C72: the MCP token sent to the API as is is refused', async () => {
    const { subjectToken } = await mcpToken()
    const authenticate = authenticator(
      server.identity,
      apiResource(server.config.PUBLIC_URL),
      () => `${server.url}/api/auth/jwks`,
    )
    const outcome = await authenticate(
      new Request(`${server.config.PUBLIC_URL}/api/me`, {
        headers: { authorization: `Bearer ${subjectToken}` },
      }),
    )
    expect(outcome).toBeInstanceOf(Response)
    expect((outcome as Response).status).toBe(401)
  })
})
