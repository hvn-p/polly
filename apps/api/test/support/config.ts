import type { Config } from '@polly/platform'
import { inject } from 'vitest'

// A configuration on the worktree's test database; the S3 and URL values are
// placeholders no test reaches over the network.
export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    DATABASE_URL: inject('testDatabaseUrl'),
    PUBLIC_URL: 'https://test.polly.localhost',
    S3_ENDPOINT: 'http://127.0.0.1:1',
    S3_REGION: 'garage',
    S3_BUCKET: 'polly-test',
    S3_ACCESS_KEY_ID: 'GK000000000000000000000000',
    S3_SECRET_ACCESS_KEY: '0'.repeat(64),
    BETTER_AUTH_SECRET: 'test-secret-'.padEnd(43, 'x'),
    MCP_CLIENT_SECRET: 'mcp-secret-'.padEnd(43, 'y'),
    POLLY_ENV: 'local',
    ...overrides,
  }
}
