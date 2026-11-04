import { describe, expect, it } from 'vitest'
import { Refusal, readConfig, readConfigOf } from './index.ts'

const env = {
  DATABASE_URL: 'postgresql://polly_a:secret@127.0.0.1:55432/polly_a',
  PUBLIC_URL: 'https://a.polly.localhost',
  S3_ENDPOINT: 'http://127.0.0.1:53900',
  S3_REGION: 'garage',
  S3_BUCKET: 'polly-a',
  S3_ACCESS_KEY_ID: 'GKabababababababababababab',
  S3_SECRET_ACCESS_KEY: 'cd'.repeat(32),
  BETTER_AUTH_SECRET: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s',
  MCP_CLIENT_SECRET: 'm'.repeat(43),
  POLLY_ENV: 'local',
}

describe('configuration', () => {
  it('C61: reads exactly the platform contract names, and nothing else', () => {
    const config = readConfig({ ...env, POLLY_MCP_URL: 'https://x/mcp', HOME: '/home/x' })
    expect(Object.keys(config).sort()).toEqual(Object.keys(env).sort())
  })

  it('refuses a configuration missing a key, naming it', () => {
    const { S3_REGION: _, ...missing } = env
    expect(() => readConfig(missing)).toThrow(/S3_REGION/)
  })

  it('refuses an environment other than local or production', () => {
    expect(() => readConfig({ ...env, POLLY_ENV: 'staging' })).toThrow(/POLLY_ENV/)
  })

  it('refuses a short auth secret', () => {
    expect(() => readConfig({ ...env, BETTER_AUTH_SECRET: 'short' })).toThrow(/BETTER_AUTH_SECRET/)
  })

  it('reads only the keys a process names', () => {
    const config = readConfigOf({ ...env, DATABASE_URL: 'not a url' }, ['PUBLIC_URL', 'MCP_CLIENT_SECRET'])
    expect(config).toEqual({ PUBLIC_URL: env.PUBLIC_URL, MCP_CLIENT_SECRET: env.MCP_CLIENT_SECRET })
    expect(() => readConfigOf({}, ['PUBLIC_URL'])).toThrow(/PUBLIC_URL/)
  })

  it("reads a process's listen addresses and ports, IPv4 or IPv6, ports as numbers", () => {
    const config = readConfigOf(
      { POLLY_API_HOST: '::1', POLLY_API_PORT: '4000', POLLY_MCP_HOST: '127.0.0.1', POLLY_MCP_PORT: '4001' },
      ['POLLY_API_HOST', 'POLLY_API_PORT', 'POLLY_MCP_HOST', 'POLLY_MCP_PORT'],
    )
    expect(config).toEqual({
      POLLY_API_HOST: '::1',
      POLLY_API_PORT: 4000,
      POLLY_MCP_HOST: '127.0.0.1',
      POLLY_MCP_PORT: 4001,
    })
  })

  it('refuses a host name where an address is expected, and a port out of range, naming both', () => {
    expect(() =>
      readConfigOf({ POLLY_API_HOST: 'localhost', POLLY_API_PORT: '70000' }, [
        'POLLY_API_HOST',
        'POLLY_API_PORT',
      ]),
    ).toThrow(
      expect.objectContaining({
        code: 'INVALID_CONFIGURATION',
        message: expect.stringMatching(/POLLY_API_HOST, POLLY_API_PORT/),
      }),
    )
  })

  it('refuses with INVALID_CONFIGURATION, a refusal the processes report', () => {
    expect(() => readConfigOf({}, ['DATABASE_URL'])).toThrow(Refusal)
  })

  it("reads the worker's settings, its mode and compute service being optional", () => {
    const keys = ['POLLY_WORKER_MODE', 'POLLY_COMPUTE_URL', 'POLLY_COMPUTE_FINGERPRINT'] as const
    expect(readConfigOf({}, keys)).toEqual({})
    expect(() => readConfigOf({ POLLY_WORKER_MODE: 'slow' }, keys)).toThrow(/POLLY_WORKER_MODE/)
  })
})
