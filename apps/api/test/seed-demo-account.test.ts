import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/entry/cli.ts'
import { DEMO_ACCOUNT, seedDemoAccount } from '../src/flows/seed-demo-account/index.ts'
import { testConfig } from './support/config.ts'
import { signIn } from './support/oauth.ts'
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
    await expect(seedDemoAccount({ environment: 'production', identity: server.identity })).rejects.toThrow(
      /^NOT_LOCAL_ENVIRONMENT/,
    )
    expect(await demoUsers()).toBe(0)
  })

  it('creates the demo account on the server side, which then signs in; an existing one is kept', async () => {
    const first = await seedDemoAccount({ environment: 'local', identity: server.identity })
    const second = await seedDemoAccount({ environment: 'local', identity: server.identity })
    expect(second).toBe(first)
    expect(await demoUsers()).toBe(1)
    expect(DEMO_ACCOUNT).toMatchObject({ name: 'Demo Learner', email: 'demo@polly.localhost' })
    expect((await signIn(server, DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)).status).toBe(200)
  })

  it('runs from the command line dev:up calls', async () => {
    const lines: string[] = []
    const status = await runCli(['seed-demo'], {
      env: { ...testConfig() },
      out: (line) => lines.push(line),
      err: () => undefined,
    })
    expect(status).toBe(0)
    expect(lines).toEqual(['demo account: demo@polly.localhost'])
  })

  it('C26: the command line refuses outside the local environment', async () => {
    const errors: string[] = []
    const env = { ...testConfig({ POLLY_ENV: 'production' }) }
    expect(await runCli(['seed-demo'], { env, out: () => undefined, err: (line) => errors.push(line) })).toBe(
      1,
    )
    expect(errors).toEqual([expect.stringMatching(/^NOT_LOCAL_ENVIRONMENT: /)])
  })
})
