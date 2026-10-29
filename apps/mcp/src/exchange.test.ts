import { describe, expect, it } from 'vitest'
import { exchangeToken } from './exchange.ts'

const settings = {
  apiUrl: 'http://127.0.0.1:4000',
  apiResource: 'https://x.polly.localhost/api',
  clientSecret: 's'.repeat(43),
}

describe('the token exchange', () => {
  it('returns the API token the identity answers, asking at its token endpoint', async () => {
    const urls: string[] = []
    const fetch = async (input: string | URL | Request) => {
      urls.push(String(input))
      return Response.json({ access_token: 'api-token', token_type: 'Bearer', expires_in: 300 })
    }
    expect(await exchangeToken({ ...settings, fetch }, 'mcp-token')).toBe('api-token')
    expect(urls).toEqual(['http://127.0.0.1:4000/api/auth/oauth2/token'])
  })

  it('exchanges to nothing on a refusal, or an answer that is not a token response', async () => {
    for (const answer of [
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
      Response.json({ access_token: 42 }),
      Response.json({ access_token: '' }),
      new Response('not json'),
    ]) {
      expect(await exchangeToken({ ...settings, fetch: async () => answer }, 'mcp-token')).toBeUndefined()
    }
  })
})
