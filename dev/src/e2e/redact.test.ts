import { describe, expect, it } from 'vitest'
import { redactEventCodes } from './redact.ts'

const code = `${'A'.repeat(42)}b`
const other = `${'C'.repeat(42)}d`

describe('event code redaction', () => {
  it('FR-035: removes every printed event code wherever the screen shows it again', () => {
    const screen = [
      `polly event code: ${code}. Bind it with the start_lesson tool of the polly MCP server.`,
      `● polly - start_lesson (MCP)(code: "${code}")`,
      `polly event code: ${other}. Bind it with the start_lesson tool of the polly MCP server.`,
    ].join('\n')
    const redacted = redactEventCodes(screen)
    expect(redacted).not.toContain(code)
    expect(redacted).not.toContain(other)
    expect(redacted).toContain('polly event code: [redacted].')
    expect(redacted).toContain('(code: "[redacted]")')
  })

  it('keeps what only looks like a code: a longer or shorter run, a session id', () => {
    const screen = `${'x'.repeat(44)} ${'y'.repeat(42)} session 7cdd64eb-658d-4a70-bca3-803580e44720`
    expect(redactEventCodes(screen)).toBe(screen)
  })
})
