import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createLogger } from './index.ts'

function capture() {
  const lines: Record<string, unknown>[] = []
  const logger = createLogger({
    name: 'polly',
    write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  })
  return { lines, logger }
}

describe('the logger', () => {
  it('writes one JSON line per call, with its level, name, message and fields', () => {
    const { lines, logger } = capture()
    logger.info('learner signed in', { learnerId: 'learner-1' })
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'info',
        name: 'polly',
        message: 'learner signed in',
        learnerId: 'learner-1',
      }),
    ])
    expect(lines[0]?.['time']).toMatch(/^\d{4}-\d\d-\d\dT/)
  })

  it('writes nothing below info, and a child carries its fields on each line', () => {
    const { lines, logger } = capture()
    logger.debug('noise')
    const child = logger.child({ module: 'http' })
    child.warn('slow', { ms: 900 })
    expect(lines).toEqual([
      expect.objectContaining({ level: 'warn', module: 'http', message: 'slow', ms: 900 }),
    ])
  })

  it('removes authorization and cookie fields, and replaces an event code or a JWT wherever it appears', () => {
    const { lines, logger } = capture()
    const code = randomBytes(32).toString('base64url')
    // Built at runtime: a JWT literal in the source is what secret scanning flags.
    const part = (value: string): string => Buffer.from(value).toString('base64url')
    const jwt = [part('{"alg":"ES256"}'), part('{"sub":"learner-1"}'), part('signature')].join('.')
    logger.error(`code ${code} and token ${jwt}`, {
      headers: { Authorization: `Bearer ${jwt}`, cookie: 'session=secret', accept: 'text/event-stream' },
      nested: [{ note: `again ${code}` }],
      learnerId: 'learner-1',
    })
    logger.child({ token: jwt }).info('bound')
    const written = JSON.stringify(lines)
    expect(written).not.toContain(code)
    expect(written).not.toContain(jwt)
    expect(written).not.toContain('session=secret')
    expect(lines[0]).toMatchObject({
      headers: { accept: 'text/event-stream' },
      nested: [{ note: 'again [REDACTED]' }],
      learnerId: 'learner-1',
    })
    expect(lines[0]?.['headers']).toEqual({ accept: 'text/event-stream' })
  })

  it('writes an error as its name and message', () => {
    const { lines, logger } = capture()
    logger.error('the API stopped', { error: new TypeError('boom') })
    expect(lines[0]?.['error']).toMatchObject({ name: 'TypeError', message: 'boom' })
  })
})
