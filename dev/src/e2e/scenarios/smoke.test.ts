import { describe, expect, it } from 'vitest'
import { smoke } from './smoke.ts'

const code = 'A'.repeat(43)

function transcript(...entries: object[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n')
}

const toolUse = (name: string, input: object = {}) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name, input }] },
})

const complete = transcript(
  toolUse('Skill', { skill: 'polly:lesson' }),
  toolUse('mcp__plugin_polly_polly__whoami'),
  { type: 'user', message: { content: `polly event code: ${code}. Bind it with the start_lesson tool…` } },
  toolUse('mcp__plugin_polly_polly__start_lesson', { code }),
  {
    type: 'user',
    message: {
      content:
        'polly event test, handle it with the polly:lesson skill. <polly-event-data>{"type":"test"}</polly-event-data>',
    },
  },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Your lesson is connected.' }] } },
)

describe('smoke scenario', () => {
  it('C44: passes when the agent reached the MCP, bound the printed code and was woken by the test event', () => {
    expect(smoke.failures(complete)).toEqual([])
    expect(smoke.done(complete)).toBe(true)
  })

  it('names each step the agent missed', () => {
    const partial = transcript(
      toolUse('Skill', { skill: 'polly:lesson' }),
      toolUse('mcp__plugin_polly_polly__whoami'),
    )
    expect(smoke.done(partial)).toBe(false)
    expect(smoke.failures(partial)).toEqual([
      'the monitor printed no event code',
      'start_lesson was not called with the printed code',
      'the test event never reached the agent',
    ])
  })

  it('refuses a code bound that is not the one the monitor printed', () => {
    const other = complete.replace(`"code":"${code}"`, `"code":"${'B'.repeat(43)}"`)
    expect(smoke.failures(other)).toContain('start_lesson was not called with the printed code')
  })
})
