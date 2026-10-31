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

  it("exchanges to nothing when the identity refuses the exchange, as OAuth's error responses do", async () => {
    for (const answer of [
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
      Response.json({ error: 'invalid_client' }, { status: 401 }),
    ]) {
      expect(await exchangeToken({ ...settings, fetch: async () => answer }, 'mcp-token')).toBeUndefined()
    }
  })

  it('fails, as unexpected, when the identity is down or answers outside OAuth', async () => {
    for (const answer of [
      () => new Response('down', { status: 503 }),
      () => Response.json({ error: 'server_error' }, { status: 500 }),
      () => Response.json({ access_token: 42 }),
      () => Response.json({ access_token: '' }),
      () => new Response('not json'),
    ]) {
      await expect(exchangeToken({ ...settings, fetch: async () => answer() }, 'mcp-token')).rejects.toThrow(
        /^the identity did not answer the token exchange/,
      )
    }
    const unreachable = async () => {
      throw new TypeError('fetch failed')
    }
    await expect(exchangeToken({ ...settings, fetch: unreachable }, 'mcp-token')).rejects.toThrow(
      'fetch failed',
    )
  })
})
