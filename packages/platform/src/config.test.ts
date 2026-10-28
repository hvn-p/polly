import { describe, expect, it } from 'vitest'
import { readConfig } from './index.ts'

const env = {
  DATABASE_URL: 'postgresql://polly_a:secret@127.0.0.1:55432/polly_a',
  PUBLIC_URL: 'https://a.polly.localhost',
  S3_ENDPOINT: 'http://127.0.0.1:53900',
  S3_REGION: 'garage',
  S3_BUCKET: 'polly-a',
  S3_ACCESS_KEY_ID: 'GKabababababababababababab',
  S3_SECRET_ACCESS_KEY: 'cd'.repeat(32),
  BETTER_AUTH_SECRET: 'q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s',
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
})
