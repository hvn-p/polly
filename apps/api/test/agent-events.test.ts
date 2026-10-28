import { createHash, randomBytes } from 'node:crypto'
import { connect as connectDatabase } from '@polly/database'
import { sql } from 'kysely'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openStream, type StreamReader } from './support/event-stream.ts'
import { fakeClock } from './support/fake-clock.ts'
import { captureLog } from './support/log.ts'
import { mcpClient } from './support/mcp.ts'
import { createLearner, mcpAccessToken } from './support/oauth.ts'
import { testServer } from './support/server.ts'

const clock = fakeClock()
const log = captureLog()
const server = await testServer({}, { clock, log: log.log })
const db = connectDatabase(server.config.DATABASE_URL)
const streams: StreamReader[] = []

afterEach(() => {
  for (const stream of streams.splice(0)) {
    stream.close()
  }
})

function newCode(): string {
  return randomBytes(32).toString('base64url')
}

async function connect(code: string | undefined, path = '/api/agent-events'): Promise<StreamReader> {
  const stream = await openStream(
    `${server.url}${path}`,
    code === undefined ? {} : { authorization: `Bearer ${code}` },
  )
  streams.push(stream)
  return stream
}

async function signedInAgent(label: string) {
  const { email, password, learnerId } = await createLearner(server, label)
  const client = await mcpClient(server, await mcpAccessToken(server, email, password))
  return { learnerId, bind: (code: string) => client.callTool({ name: 'start_lesson', arguments: { code } }) }
}

describe('agent-event stream: refusals', () => {
  it('C48: refuses a request with no code header, or with the code in the URL only', async () => {
    expect(await connect(undefined)).toMatchObject({ status: 401, body: { code: 'UNAUTHORIZED' } })
    expect(await connect(undefined, `/api/agent-events?code=${newCode()}`)).toMatchObject({
      status: 401,
      body: { code: 'UNAUTHORIZED' },
    })
  })

  it('C49: refuses a malformed code, accepts 43 base64url characters', async () => {
    for (const code of [newCode().slice(1), `${newCode()}A`, `${newCode().slice(1)}+`]) {
      expect(await connect(code)).toMatchObject({ status: 400, body: { code: 'INVALID_EVENT_CODE' } })
    }
    expect((await connect(newCode())).status).toBe(200)
  })

  it('C50: refuses a revoked code', async () => {
    const agent = await signedInAgent('revoked')
    const code = newCode()
    await agent.bind(code)
    await sql`update agent_event_code set revoked_at = now() where code_hash = ${createHash('sha256').update(code).digest('hex')}`.execute(
      db,
    )
    expect(await connect(code)).toMatchObject({ status: 403, body: { code: 'EVENT_CODE_REVOKED' } })
  })
})

describe('agent-event stream: events', () => {
  it('C51: an unbound connection gets nothing, is still open at 119 s, closed at 120 s with EVENT_CODE_NOT_BOUND', async () => {
    const stream = await connect(newCode())
    await clock.advance(119_000)
    expect(stream.frames).toEqual([])
    expect(stream.isEnded()).toBe(false)
    await clock.advance(1_000)
    await stream.ended
    expect(stream.frames).toEqual([{ event: 'error', data: { code: 'EVENT_CODE_NOT_BOUND' } }])
  })

  it('C47: a connection waiting with an unbound code gets the test event once start_lesson binds it', async () => {
    const agent = await signedInAgent('waiting')
    const code = newCode()
    const stream = await connect(code)
    await clock.advance(3_000)
    expect(stream.frames).toEqual([])
    await agent.bind(code)
    await clock.advance(1_000)
    expect(stream.frames).toEqual([{ event: 'test', data: { type: 'test' } }])
  })

  it('a bound connection gets the test event, then a comment every 15 s', async () => {
    const agent = await signedInAgent('bound')
    const code = newCode()
    await agent.bind(code)
    const stream = await connect(code)
    await clock.advance(30_000)
    expect(stream.frames).toEqual([
      { event: 'test', data: { type: 'test' } },
      { comment: 'keepalive' },
      { comment: 'keepalive' },
    ])
  })

  it('C56: five codes bound by one learner, five connections: five test events', async () => {
    const agent = await signedInAgent('five')
    const codes = Array.from({ length: 5 }, newCode)
    for (const code of codes) {
      await agent.bind(code)
    }
    const connections = await Promise.all(codes.map((code) => connect(code)))
    await clock.advance(1_000)
    for (const stream of connections) {
      expect(stream.frames[0]).toEqual({ event: 'test', data: { type: 'test' } })
    }
  })

  it('C57: through a full binding and stream cycle, the code reaches no log line', async () => {
    const logged: string[] = []
    const capture = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '))
    }
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(capture),
    )
    const code = newCode()
    try {
      const agent = await signedInAgent('logs')
      const stream = await connect(code)
      await agent.bind(code)
      await clock.advance(1_000)
      expect(stream.frames).toHaveLength(1)
      await connect(`${code.slice(1)}+`)
    } finally {
      for (const spy of spies) {
        spy.mockRestore()
      }
    }
    // The request log saw the stream's requests, the refused one included.
    expect(log.records()).toContainEqual(
      expect.objectContaining({ module: 'http', path: '/api/agent-events', status: 400 }),
    )
    const lines = [...log.lines, ...logged]
    expect(lines.filter((line) => line.includes(code) || line.includes(code.slice(1)))).toEqual([])
  })
})
