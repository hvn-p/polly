import { apiResource, MCP_CLIENT_ID } from '@polly/identity'
import { hash } from '@polly/kernel'
import { describe, expect, it } from 'vitest'
import { refusal } from '../src/contracts/agent-events.ts'
import { claimsOf, createLearner, exchangeToken, mcpAccessToken } from './support/oauth.ts'
import { testServer } from './support/server.ts'

const server = await testServer()

async function mcpToken() {
  const { learnerId, email, password } = await createLearner(server)
  return { learnerId, subjectToken: await mcpAccessToken(server, email, password) }
}

describe('token exchange', () => {
  it("keeps the MCP server's secret as the kernel's hash, never in clear", async () => {
    const { adapter } = await server.identity.$context
    const client = await adapter.findOne<{ clientSecret: string }>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: MCP_CLIENT_ID }],
    })
    expect(client?.clientSecret).toBe(hash(server.config.MCP_CLIENT_SECRET))
  })

  it('C73: exchanges the MCP token for an API token naming the same learner, valid 5 minutes', async () => {
    const { learnerId, subjectToken } = await mcpToken()
    const response = await exchangeToken(server, { subjectToken })
    expect(response.status).toBe(200)
    const { access_token: token } = (await response.json()) as { access_token: string }
    const claims = claimsOf(token)
    expect(claims['sub']).toBe(learnerId)
    expect([claims['aud']].flat()).toContain(apiResource(server.config.PUBLIC_URL))
    expect([claims['aud']].flat()).not.toContain(`${server.config.PUBLIC_URL}/mcp`)
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
    const response = await fetch(`${server.url}/api/me`, {
      headers: { authorization: `Bearer ${subjectToken}` },
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer .*resource_metadata=/)
    expect(refusal.parse(await response.json()).code).toBe('UNAUTHORIZED')
  })
})
