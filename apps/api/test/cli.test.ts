import { afterEach, describe, expect, inject, it } from 'vitest'
import { runCli } from '../src/entry/cli.ts'
import { resetLogging } from '../src/entry/logger.ts'
import { testConfig } from './support/config.ts'
import { captureLog } from './support/log.ts'

afterEach(resetLogging)

const out = () => undefined

describe('API command line', () => {
  it('refuses an invalid configuration, naming the key', async () => {
    const log = await captureLog()
    const { DATABASE_URL: _, ...env } = testConfig()
    expect(await runCli(['seed-demo'], { env, out })).toBe(1)
    expect(log.records()).toEqual([
      expect.objectContaining({
        level: 'ERROR',
        properties: { code: 'INVALID_CONFIGURATION', reason: expect.stringContaining('DATABASE_URL') },
      }),
    ])
  })

  it('refuses an unknown command', async () => {
    const log = await captureLog()
    expect(await runCli(['nope'], { env: { ...testConfig() }, out })).toBe(1)
    expect(log.records()).toEqual([
      expect.objectContaining({
        properties: { code: 'UNKNOWN_COMMAND', reason: expect.stringMatching(/^nope/) },
      }),
    ])
    expect(inject('testDatabaseUrl')).toMatch(/_test$/)
  })
})
