import { readConfig } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { createS3Client } from './index.ts'

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

describe('S3 client', () => {
  it('C61: builds an S3 client that addresses objects by path', async () => {
    const client = createS3Client(readConfig(env))
    expect(client.config.forcePathStyle).toBe(true)
    expect(await client.config.region()).toBe('garage')
    const endpoint = await client.config.endpoint?.()
    expect(endpoint?.hostname).toBe('127.0.0.1')
    expect(endpoint?.port).toBe(53900)
    expect((await client.config.credentials()).accessKeyId).toBe(env.S3_ACCESS_KEY_ID)
  })
})
