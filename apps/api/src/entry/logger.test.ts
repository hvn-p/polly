import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { configureLogging, logger, resetLogging } from './logger.ts'

afterEach(resetLogging)

async function capture(): Promise<Record<string, unknown>[]> {
  const lines: Record<string, unknown>[] = []
  await configureLogging((line) => lines.push(JSON.parse(line) as Record<string, unknown>))
  return lines
}

describe('the API logger', () => {
  it('writes one JSON line per record, with its level, category and properties', async () => {
    const lines = await capture()
    logger('test').info('learner {learnerId} signed in', { learnerId: 'learner-1' })
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'INFO',
        logger: 'polly.test',
        message: expect.stringContaining('learner-1'),
        properties: { learnerId: 'learner-1' },
      }),
    ])
  })

  it('removes authorization and cookie fields, and replaces an event code or a JWT wherever it appears', async () => {
    const lines = await capture()
    const code = randomBytes(32).toString('base64url')
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJsZWFybmVyLTEifQ.c2lnbmF0dXJl'
    logger('test').warn(`code ${code} and token ${jwt}`, {
      headers: { authorization: `Bearer ${jwt}`, cookie: 'session=secret', accept: 'text/event-stream' },
      learnerId: 'learner-1',
    })
    const written = JSON.stringify(lines)
    expect(written).not.toContain(code)
    expect(written).not.toContain(jwt)
    expect(written).not.toContain('session=secret')
    expect(lines[0]?.['properties']).toEqual({
      headers: { accept: 'text/event-stream' },
      learnerId: 'learner-1',
    })
  })
})
