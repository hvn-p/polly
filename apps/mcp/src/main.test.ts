import { describe, expect, it } from 'vitest'
import { settingsFrom } from './main.ts'

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
