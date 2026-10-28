import { describe, expect, inject, it } from 'vitest'
import { runCli } from '../src/entry/cli.ts'
import { testConfig } from './support/config.ts'
import { captureLog } from './support/log.ts'

const out = () => undefined

describe('API command line', () => {
  it('refuses an invalid configuration, naming the key', async () => {
    const capture = captureLog()
    const { DATABASE_URL: _, ...env } = testConfig()
    expect(await runCli(['seed-demo'], { env, out, log: capture.log })).toBe(1)
    expect(capture.records()).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'INVALID_CONFIGURATION',
        message: expect.stringContaining('DATABASE_URL'),
      }),
    ])
  })

  it('refuses an unknown command', async () => {
    const capture = captureLog()
    expect(await runCli(['nope'], { env: { ...testConfig() }, out, log: capture.log })).toBe(1)
    expect(capture.records()).toEqual([
      expect.objectContaining({
        code: 'UNKNOWN_COMMAND',
        message: expect.stringMatching(/^UNKNOWN_COMMAND: nope/),
      }),
    ])
    expect(inject('testDatabaseUrl')).toMatch(/__test$/)
  })
})
