import { describe, expect, it } from 'vitest'
import { smoke } from './smoke.ts'

const code = 'A'.repeat(43)
const eventLine =
  'polly event test, handle it with the polly:lesson skill. &lt;polly-event-data&gt;{"type":"test"}&lt;/polly-event-data&gt;'

function transcript(...entries: object[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n')
}

const toolUse = (id: string, name: string, input: object = {}) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name, input }] },
})

const toolResult = (id: string, content: string, isError = false) => ({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
})

// A monitor line as Claude Code records it: queued, then delivered to the agent.
const notification = (line: string) => `<task-notification>\n<event>${line}</event>\n</task-notification>`
const queued = (line: string) => ({
  type: 'queue-operation',
  operation: 'enqueue',
  content: notification(line),
})
const delivered = (line: string) => ({
  type: 'attachment',
  attachment: { type: 'queued_command', prompt: notification(line) },
})

const reply = { type: 'assistant', message: { content: [{ type: 'text', text: 'The test event arrived.' }] } }

const beforeEvent = [
  toolUse('t1', 'Skill', { skill: 'polly:lesson' }),
  toolUse('t2', 'mcp__plugin_polly_polly__whoami'),
  toolResult('t2', '{"learnerId":"learner-1"}'),
  delivered(`polly event code: ${code}. Bind it with the start_lesson tool of the polly MCP server.`),
  toolUse('t3', 'mcp__plugin_polly_polly__start_lesson', { code }),
  toolResult('t3', '{"bound":true}'),
]

const complete = transcript(...beforeEvent, queued(eventLine), delivered(eventLine), reply)

describe('smoke scenario', () => {
  it('C44: passes when the agent reached the MCP, bound the printed code and answered the test event', () => {
    expect(smoke.failures(complete)).toEqual([])
    expect(smoke.done(complete)).toBe(true)
  })

  it('names each step the agent missed', () => {
    const partial = transcript(...beforeEvent.slice(0, 3))
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

  it('C44: is not done while the test event is only queued, never delivered to the agent', () => {
    const onlyQueued = transcript(...beforeEvent, queued(eventLine), reply)
    expect(smoke.done(onlyQueued)).toBe(false)
    expect(smoke.failures(onlyQueued)).toEqual(['the test event never reached the agent'])
  })

  it('C44: is not done until the agent takes a turn after the test event', () => {
    const unanswered = transcript(...beforeEvent, delivered(eventLine))
    expect(smoke.done(unanswered)).toBe(false)
    expect(smoke.failures(unanswered)).toEqual(['the agent did not handle the test event'])
  })

  it('C27: fails when whoami answered with an error', () => {
    const failed = complete.replace(
      JSON.stringify(toolResult('t2', '{"learnerId":"learner-1"}')),
      JSON.stringify(toolResult('t2', 'UNAUTHORIZED', true)),
    )
    expect(smoke.failures(failed)).toEqual(['whoami did not return a learner'])
  })
})
