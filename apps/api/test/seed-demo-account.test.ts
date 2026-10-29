import { DEMO_ACCOUNT, seedDemoAccount } from '@polly/back'
import { learnerAccounts } from '@polly/identity'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli.ts'
import { testConfig } from './support/config.ts'
import { captureLog } from './support/log.ts'
import { mcpAccessToken, signIn } from './support/oauth.ts'
import { testServer } from './support/server.ts'

const server = await testServer()

async function demoUsers(): Promise<number> {
  const { rows } = await sql<{
    count: number
  }>`select count(*)::int as count from "user" where email = ${DEMO_ACCOUNT.email}`.execute(
    (await server.identity.$context).options.database.db,
  )
  return rows[0]?.count ?? 0
}

describe('demo account seed', () => {
  it('C26: refuses to run outside the local environment, and creates no account', async () => {
    await expect(
      seedDemoAccount({ environment: 'production', accounts: learnerAccounts(server.identity) }),
    ).rejects.toMatchObject({
      code: 'NOT_LOCAL_ENVIRONMENT',
    })
    expect(await demoUsers()).toBe(0)
  })

  it('creates the demo account on the server side, which then signs in; an existing one is kept', async () => {
    const first = await seedDemoAccount({ environment: 'local', accounts: learnerAccounts(server.identity) })
    const second = await seedDemoAccount({ environment: 'local', accounts: learnerAccounts(server.identity) })
    expect(second).toBe(first)
    expect(await demoUsers()).toBe(1)
    expect(DEMO_ACCOUNT).toMatchObject({ name: 'Demo Learner', email: 'demo@polly.localhost' })
    expect((await signIn(server, DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)).status).toBe(200)
  })

  it('C21: the seeded demo account signs in, authorizes with PKCE and gets an MCP token', async () => {
    await seedDemoAccount({ environment: 'local', accounts: learnerAccounts(server.identity) })
    const token = await mcpAccessToken(server, DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
    const [, payload = ''] = token.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { aud: string | string[] }
    expect([claims.aud].flat()).toContain(`${server.config.PUBLIC_URL}/mcp`)
  })

  it('runs from the command line dev:up calls', async () => {
    const lines: string[] = []
    const status = await runCli(['seed-demo'], {
      env: { ...testConfig() },
      out: (line) => lines.push(line),
      log: captureLog().log,
    })
    expect(status).toBe(0)
    expect(lines).toEqual(['demo account: demo@polly.localhost'])
  })

  it('C26: the command line refuses outside the local environment', async () => {
    const capture = captureLog()
    const env = { ...testConfig({ POLLY_ENV: 'production' }) }
    expect(await runCli(['seed-demo'], { env, out: () => undefined, log: capture.log })).toBe(1)
    expect(capture.records()).toEqual([
      expect.objectContaining({ level: 'error', code: 'NOT_LOCAL_ENVIRONMENT' }),
    ])
  })
})
