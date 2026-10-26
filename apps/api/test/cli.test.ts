import { describe, expect, inject, it } from 'vitest'
import { runCli } from '../src/entry/cli.ts'
import { testConfig } from './support/config.ts'

function io() {
  const lines: string[] = []
  return { lines, write: (line: string) => lines.push(line) }
}

describe('API command line', () => {
  it('migrates the database of its configuration; nothing is pending afterwards', async () => {
    const out = io()
    const status = await runCli(['migrate'], { env: { ...testConfig() }, out: out.write, err: io().write })
    expect(status).toBe(0)
    expect(out.lines).toEqual(['migrations: up to date'])
  })

  it('refuses an invalid configuration, naming the key', async () => {
    const err = io()
    const { DATABASE_URL: _, ...env } = testConfig()
    expect(await runCli(['migrate'], { env, out: io().write, err: err.write })).toBe(1)
    expect(err.lines.join('\n')).toMatch(/^INVALID_CONFIGURATION: .*DATABASE_URL/)
  })

  it('refuses an unknown command', async () => {
    const err = io()
    expect(await runCli(['nope'], { env: { ...testConfig() }, out: io().write, err: err.write })).toBe(1)
    expect(err.lines).toEqual([expect.stringMatching(/^UNKNOWN_COMMAND: nope/)])
    expect(inject('testDatabaseUrl')).toMatch(/_test$/)
  })
})
