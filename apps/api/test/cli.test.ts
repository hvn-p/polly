import { describe, expect, inject, it } from 'vitest'
import { runCli } from '../src/cli.ts'
import { testConfig } from './support/config.ts'
import { captureLog } from './support/log.ts'

const out = () => undefined

describe('API command line', () => {
  it('refuses an invalid configuration, naming the key', async () => {
    const capture = captureLog()
    const { DATABASE_URL: _, ...env } = testConfig()
    expect(await runCli(['seed-demo'], { env, out })).toBe(1)
    expect(capture.records()).toEqual([
      expect.objectContaining({
        level: 'error',
        event: 'api.command.refused',
        code: 'INVALID_CONFIGURATION',
        reason: expect.stringContaining('DATABASE_URL'),
      }),
    ])
  })

  it('refuses an unknown command', async () => {
    const capture = captureLog()
    expect(await runCli(['nope'], { env: { ...testConfig() }, out })).toBe(1)
    expect(capture.records()).toEqual([
      expect.objectContaining({
        event: 'api.command.refused',
        code: 'UNKNOWN_COMMAND',
        reason: expect.stringMatching(/^nope;/),
      }),
    ])
    expect(inject('testDatabaseUrl')).toMatch(/__test$/)
  })
})
