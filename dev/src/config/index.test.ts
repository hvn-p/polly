import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resourceNames } from '../identity/index.ts'
import { completeEnv, parseEnv } from './index.ts'

const template = readFileSync(join(import.meta.dirname, '..', '..', 'env.template'), 'utf8')

let nextPort = 41000
const generators = {
  postgresPort: 55432,
  garagePort: 53900,
  freePort: async () => nextPort++,
  random: (bytes: number) => Buffer.alloc(bytes, 0xab),
}

describe('worktree configuration', () => {
  it('generates every key of the template on a fresh worktree', async () => {
    const env = parseEnv(await completeEnv(template, '', { branch: 'feature/x', ...generators }))
    const identity = env.get('POLLY_WORKTREE_ID') ?? ''
    expect(identity).toMatch(/^feature-x-[0-9a-f]{4}$/)
    const underscored = identity.replaceAll('-', '_')
    expect(env.get('PUBLIC_URL')).toBe(`https://${identity}.polly.localhost`)
    expect(env.get('POLLY_MCP_URL')).toBe(`https://${identity}.polly.localhost/mcp`)
    expect(env.get('POLLY_EVENTS_URL')).toBe(`https://${identity}.polly.localhost/api/agent-events`)
    expect(env.get('POLLY_API_PORT')).not.toBe(env.get('POLLY_WEB_PORT'))
    expect(env.get('DATABASE_URL')).toBe(
      `postgresql://polly_${underscored}:${'ab'.repeat(24)}@127.0.0.1:55432/polly_${underscored}`,
    )
    expect(env.get('TEST_DATABASE_URL')).toBe(
      `${env.get('DATABASE_URL')?.replace(/[^/]+$/, '')}${resourceNames(identity).testDatabase}`,
    )
    expect(env.get('S3_ENDPOINT')).toBe('http://127.0.0.1:53900')
    expect(env.get('S3_BUCKET')).toBe(`polly-${identity}`)
    expect(env.get('S3_ACCESS_KEY_ID')).toBe(`GK${'ab'.repeat(12)}`)
    expect(env.get('BETTER_AUTH_SECRET')).toBe(Buffer.alloc(32, 0xab).toString('base64url'))
    expect(env.get('POLLY_ENV')).toBe('local')
    expect(env.get('POLLY_WORKER_MODE')).toBe('fake')
  })

  it('C14: keeps existing values byte-identical and adds the missing keys', async () => {
    const fresh = await completeEnv(template, '', { branch: 'main', ...generators })
    const withoutSecret = fresh
      .split('\n')
      .filter((line) => !line.startsWith('BETTER_AUTH_SECRET='))
      .join('\n')
    const edited = withoutSecret.replace(/^POLLY_WORKER_MODE=fake$/m, 'POLLY_WORKER_MODE=real')
    const completed = await completeEnv(template, edited, {
      branch: 'renamed',
      postgresPort: 1,
      garagePort: 1,
      freePort: async () => 1,
      random: (bytes: number) => Buffer.alloc(bytes, 0xcd),
    })
    expect(completed.startsWith(edited)).toBe(true)
    const env = parseEnv(completed)
    expect(env.get('BETTER_AUTH_SECRET')).toBe(Buffer.alloc(32, 0xcd).toString('base64url'))
    expect(env.get('POLLY_WORKTREE_ID')).toBe('main')
    expect(env.get('POLLY_WORKER_MODE')).toBe('real')
  })

  it('changes nothing when every key is present', async () => {
    const fresh = await completeEnv(template, '', { branch: 'main', ...generators })
    expect(await completeEnv(template, fresh, { branch: 'other', ...generators })).toBe(fresh)
  })

  it('derives resource names from the recorded identity, not from the current branch', async () => {
    const partial = 'POLLY_WORKTREE_ID=recorded\n'
    const env = parseEnv(await completeEnv(template, partial, { branch: 'renamed', ...generators }))
    expect(env.get('S3_BUCKET')).toBe('polly-recorded')
  })

  it('refuses a template that references an unknown key or generator', async () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a template reference, not a JavaScript one.
    await expect(completeEnv('A=${MISSING}\n', '', { branch: 'b', ...generators })).rejects.toThrow(/MISSING/)
    await expect(completeEnv('A={{nope}}\n', '', { branch: 'b', ...generators })).rejects.toThrow(/nope/)
  })
})
