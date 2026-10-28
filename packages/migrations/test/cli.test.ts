import { describe, expect, inject, it } from 'vitest'
import { runCli } from '../src/cli.ts'

function io() {
  const lines: string[] = []
  return { lines, write: (line: string) => lines.push(line) }
}

describe('migrations command line', () => {
  it('migrates the database of DATABASE_URL; nothing is pending afterwards', async () => {
    const out = io()
    const env = { DATABASE_URL: inject('testDatabaseUrl') }
    expect(await runCli(['migrate'], { env, out: out.write, err: io().write })).toBe(0)
    expect(out.lines).toEqual(['migrations: up to date'])
  })

  it('refuses a missing or non-Postgres DATABASE_URL', async () => {
    for (const env of [{}, { DATABASE_URL: 'mysql://u:p@127.0.0.1/x' }]) {
      const err = io()
      expect(await runCli(['migrate'], { env, out: io().write, err: err.write })).toBe(1)
      expect(err.lines).toEqual([expect.stringMatching(/^INVALID_CONFIGURATION: DATABASE_URL/)])
    }
  })

  it('refuses an unknown command', async () => {
    const err = io()
    const env = { DATABASE_URL: inject('testDatabaseUrl') }
    expect(await runCli(['nope'], { env, out: io().write, err: err.write })).toBe(1)
    expect(err.lines).toEqual([expect.stringMatching(/^UNKNOWN_COMMAND: nope/)])
  })
})
