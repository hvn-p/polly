import { randomBytes } from 'node:crypto'
import { defineEvent, type LogFields, logFrom, plugLogSink, Refusal } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { createLogSink, runProcess, traceparent, withTrace } from './index.ts'

const SOURCE = { tier: 'adapters', module: 'packages/identity', file: 'packages/identity/src/sessions.ts' }
const log = logFrom(SOURCE)
const FAILED = defineEvent('identity.sign_in.failed', {
  category: 'security',
  level: 'warn',
  investigate: 'who failed to sign in',
})
const NOISE = defineEvent('identity.cache.missed', {
  category: 'technical',
  level: 'debug',
  investigate: 'x',
})

function capture(): Record<string, unknown>[] {
  const lines: Record<string, unknown>[] = []
  plugLogSink(
    createLogSink({
      name: 'polly-api',
      write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
    }),
  )
  return lines
}

describe('the Pino sink', () => {
  it('writes one JSON line per event: time, level, event, category, process, source and fields', () => {
    const lines = capture()
    log(FAILED, { learnerId: 'learner-1' })
    expect(lines).toEqual([
      {
        time: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        level: 'warn',
        event: 'identity.sign_in.failed',
        category: 'security',
        process: 'polly-api',
        tier: 'adapters',
        module: 'packages/identity',
        file: 'packages/identity/src/sessions.ts',
        learnerId: 'learner-1',
      },
    ])
  })

  it('writes nothing below info', () => {
    const lines = capture()
    log(NOISE)
    expect(lines).toEqual([])
  })

  it('removes authorization and cookie fields, and replaces an event code or a JWT wherever it appears', () => {
    const lines = capture()
    const code = randomBytes(32).toString('base64url')
    // Built at runtime: a JWT literal in the source is what secret scanning flags.
    const part = (value: string): string => Buffer.from(value).toString('base64url')
    const jwt = [part('{"alg":"ES256"}'), part('{"sub":"learner-1"}'), part('signature')].join('.')
    log(FAILED, {
      reason: `code ${code} and token ${jwt}`,
      headers: { Authorization: `Bearer ${jwt}`, cookie: 'session=secret', accept: 'text/event-stream' },
      nested: [{ note: `again ${code}` }],
      learnerId: 'learner-1',
    })
    const written = JSON.stringify(lines)
    expect(written).not.toContain(code)
    expect(written).not.toContain(jwt)
    expect(written).not.toContain('session=secret')
    expect(lines[0]).toMatchObject({
      reason: 'code [REDACTED] and token [REDACTED]',
      nested: [{ note: 'again [REDACTED]' }],
      learnerId: 'learner-1',
    })
    expect(lines[0]?.['headers']).toEqual({ accept: 'text/event-stream' })
  })

  it('writes an error as its name, message and stack', () => {
    const lines = capture()
    log(FAILED, { error: new TypeError('boom') })
    expect(lines[0]?.['error']).toEqual({
      name: 'TypeError',
      message: 'boom',
      stack: expect.stringContaining('index.test.ts'),
    })
  })
})

describe('the trace', () => {
  it('carries the incoming trace id to every line written inside it, and none outside', async () => {
    const lines = capture()
    const incoming = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`
    await withTrace(incoming, async () => {
      await Promise.resolve()
      log(FAILED)
    })
    log(FAILED)
    expect(lines.map((line) => line['trace_id'])).toEqual(['a'.repeat(32), undefined])
  })

  it('starts a trace when the request carries none or a malformed one', () => {
    const lines = capture()
    for (const header of [undefined, 'not-a-traceparent', `00-${'0'.repeat(32)}-${'b'.repeat(16)}-01`]) {
      withTrace(header, () => log(FAILED))
    }
    const ids = lines.map((line) => line['trace_id'])
    expect(ids).toEqual([expect.stringMatching(/^[0-9a-f]{32}$/), expect.anything(), expect.anything()])
    expect(new Set(ids).size).toBe(3)
    expect(ids).not.toContain('0'.repeat(32))
  })

  it('gives the traceparent to send downstream: the same trace, a new span', () => {
    expect(traceparent()).toBeUndefined()
    withTrace(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`, () => {
      expect(traceparent()).toMatch(new RegExp(`^00-${'a'.repeat(32)}-[0-9a-f]{16}-01$`))
      expect(traceparent()).not.toContain('b'.repeat(16))
    })
  })
})

describe('running a process', () => {
  async function run(
    start: () => Promise<LogFields>,
  ): Promise<{ lines: Record<string, unknown>[]; exits: number[] }> {
    const lines: Record<string, unknown>[] = []
    const exits: number[] = []
    await runProcess({
      name: 'polly-worker',
      start,
      write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
      exit: (code) => exits.push(code),
    })
    return { lines, exits }
  }

  it('plugs its sink in and logs the start with what the process reports', async () => {
    const { lines, exits } = await run(async () => ({ url: 'http://127.0.0.1:1' }))
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'info',
        event: 'logging.process.started',
        process: 'polly-worker',
        url: 'http://127.0.0.1:1',
      }),
    ])
    expect(exits).toEqual([])
  })

  it('logs a refusal by its code and reason, any other failure as an error, and exits 1', async () => {
    const refused = await run(async () => {
      throw new Refusal('INVALID_CONFIGURATION', 'DATABASE_URL invalid or missing')
    })
    expect(refused.lines).toEqual([
      expect.objectContaining({
        level: 'error',
        event: 'logging.process.refused',
        code: 'INVALID_CONFIGURATION',
        reason: 'DATABASE_URL invalid or missing',
      }),
    ])
    expect(refused.exits).toEqual([1])
    const failed = await run(async () => {
      throw new Error('connection refused')
    })
    expect(failed.lines).toEqual([
      expect.objectContaining({
        level: 'error',
        event: 'logging.process.failed',
        error: expect.objectContaining({ message: 'connection refused' }),
      }),
    ])
    expect(failed.exits).toEqual([1])
  })
})
