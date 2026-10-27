import { describe, expect, inject, it } from 'vitest'
import { runCli } from '../src/entry/cli.ts'
import { testConfig } from './support/config.ts'

function io() {
  const lines: string[] = []
  return { lines, write: (line: string) => lines.push(line) }
}

describe('API command line', () => {
  it('refuses an invalid configuration, naming the key', async () => {
    const err = io()
    const { DATABASE_URL: _, ...env } = testConfig()
    expect(await runCli(['seed-demo'], { env, out: io().write, err: err.write })).toBe(1)
    expect(err.lines.join('\n')).toMatch(/^INVALID_CONFIGURATION: .*DATABASE_URL/)
  })

  it('refuses an unknown command', async () => {
    const err = io()
    expect(await runCli(['nope'], { env: { ...testConfig() }, out: io().write, err: err.write })).toBe(1)
    expect(err.lines).toEqual([expect.stringMatching(/^UNKNOWN_COMMAND: nope/)])
    expect(inject('testDatabaseUrl')).toMatch(/_test$/)
  })
})
