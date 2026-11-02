import { describe, expect, it } from 'vitest'
import { settingsFrom, tracingFetch } from './main.ts'

const env = {
  POLLY_MCP_HOST: '127.0.0.1',
  POLLY_MCP_PORT: '4001',
  POLLY_API_HOST: '127.0.0.1',
  POLLY_API_PORT: '4000',
  PUBLIC_URL: 'https://x.polly.localhost',
  MCP_CLIENT_SECRET: 'm'.repeat(43),
}

describe("the MCP server's settings", () => {
  it('reaches the API on its own address, never the public origin', () => {
    expect(settingsFrom(env)).toEqual({
      hostname: '127.0.0.1',
      port: 4001,
      publicUrl: 'https://x.polly.localhost',
      apiUrl: 'http://127.0.0.1:4000',
      clientSecret: 'm'.repeat(43),
    })
  })

  it('brackets an IPv6 API address, and reads a wildcard one back on loopback', () => {
    expect(settingsFrom({ ...env, POLLY_API_HOST: '::1' }).apiUrl).toBe('http://[::1]:4000')
    expect(settingsFrom({ ...env, POLLY_API_HOST: '::' }).apiUrl).toBe('http://[::1]:4000')
    expect(settingsFrom({ ...env, POLLY_API_HOST: '0.0.0.0' }).apiUrl).toBe('http://127.0.0.1:4000')
  })

  it('refuses a missing or malformed setting, naming it', () => {
    expect(() => settingsFrom({ ...env, POLLY_MCP_HOST: 'localhost', POLLY_API_PORT: '' })).toThrow(
      /^POLLY_MCP_HOST, POLLY_API_PORT invalid or missing/,
    )
  })
})

describe("the MCP server's calls to the API", () => {
  it("carry the request's trace, keeping the headers of a Request given as input", async () => {
    const sent: Request[] = []
    const fetch = tracingFetch(
      () => `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
      async (input) => {
        sent.push(input)
        return new Response()
      },
    )
    await fetch(new Request('http://127.0.0.1:4000/api/me', { headers: { authorization: 'Bearer t' } }))
    await fetch('http://127.0.0.1:4000/api/me', { headers: { accept: 'application/json' } })
    expect(sent.map(({ url, headers }) => [url, Object.fromEntries(headers)])).toEqual([
      [
        'http://127.0.0.1:4000/api/me',
        { authorization: 'Bearer t', traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01` },
      ],
      [
        'http://127.0.0.1:4000/api/me',
        { accept: 'application/json', traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01` },
      ],
    ])
  })
})
