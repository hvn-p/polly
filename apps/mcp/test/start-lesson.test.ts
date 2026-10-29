import { createHash, randomBytes } from 'node:crypto'
import { createLearner, mcpAccessToken } from '@polly/api/test-support'
import { connect } from '@polly/database'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { mcpClient, resultOf } from './support/mcp.ts'
import { mcpTestServer } from './support/server.ts'

const server = await mcpTestServer()
const db = connect(server.config.DATABASE_URL)

function newCode(): string {
  return randomBytes(32).toString('base64url')
}

async function learnerClient(label: string) {
  const learner = await createLearner(server, label)
  return {
    ...learner,
    client: await mcpClient(server, await mcpAccessToken(server, learner.email, learner.password)),
  }
}

function startLesson(client: Awaited<ReturnType<typeof learnerClient>>['client'], code: string) {
  return client.callTool({ name: 'start_lesson', arguments: { code } }).then(resultOf)
}

async function rows(code: string) {
  const hash = createHash('sha256').update(code).digest('hex')
  return (
    await sql<{ learner_id: string; revoked: boolean }>`
      select learner_id, revoked_at is not null as revoked from agent_event_code where code_hash = ${hash}`.execute(
      db,
    )
  ).rows
}

describe('start_lesson', () => {
  it('binds a code to the signed-in learner, storing only its hash', async () => {
    const { client, learnerId } = await learnerClient('binder')
    const code = newCode()
    expect(await startLesson(client, code)).toEqual({ bound: true })
    expect(await rows(code)).toEqual([{ learner_id: learnerId, revoked: false }])
    const stored = await sql<{
      text: string
    }>`select row_to_json(c)::text as text from agent_event_code c`.execute(db)
    expect(stored.rows.map(({ text }) => text).join()).not.toContain(code)
  })

  it('C53: binding twice for the same learner succeeds, with one binding', async () => {
    const { client, learnerId } = await learnerClient('twice')
    const code = newCode()
    expect(await startLesson(client, code)).toEqual({ bound: true })
    expect(await startLesson(client, code)).toEqual({ bound: true })
    expect(await rows(code)).toEqual([{ learner_id: learnerId, revoked: false }])
  })

  it('C52: a code bound to another learner is refused, and keeps its learner', async () => {
    const a = await learnerClient('a')
    const b = await learnerClient('b')
    const code = newCode()
    await startLesson(a.client, code)
    expect(await startLesson(b.client, code)).toEqual({
      error: expect.stringMatching(/^EVENT_CODE_ALREADY_BOUND/),
    })
    expect(await rows(code)).toEqual([{ learner_id: a.learnerId, revoked: false }])
  })

  it('C54: a revoked code is refused', async () => {
    const { client } = await learnerClient('revoked')
    const code = newCode()
    await startLesson(client, code)
    const hash = createHash('sha256').update(code).digest('hex')
    await sql`update agent_event_code set revoked_at = now() where code_hash = ${hash}`.execute(db)
    expect(await startLesson(client, code)).toEqual({ error: expect.stringMatching(/^EVENT_CODE_REVOKED/) })
  })

  it('C55: a malformed code is refused: 42 or 44 characters, or outside base64url', async () => {
    const { client } = await learnerClient('malformed')
    for (const code of [newCode().slice(1), `${newCode()}A`, `${newCode().slice(1)}+`]) {
      expect(await startLesson(client, code)).toEqual({ error: expect.stringMatching(/^INVALID_EVENT_CODE/) })
    }
  })

  it('a learner may hold any number of active codes', async () => {
    const { client, learnerId } = await learnerClient('many')
    const codes = [newCode(), newCode(), newCode()]
    for (const code of codes) {
      expect(await startLesson(client, code)).toEqual({ bound: true })
    }
    for (const code of codes) {
      expect(await rows(code)).toEqual([{ learner_id: learnerId, revoked: false }])
    }
  })

  it('describes start_lesson as the contract writes it, naming no client', async () => {
    const { client } = await learnerClient('describe')
    const { tools } = await client.listTools()
    expect(tools.find(({ name }) => name === 'start_lesson')?.description).toBe(
      "Connects the lesson's event stream to the signed-in learner. Call it with the event code your Polly event listener gave you, each time it gives a new one. The code is a secret: do not repeat it to the user.",
    )
  })
})
