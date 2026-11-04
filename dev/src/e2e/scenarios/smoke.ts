// The smoke scenario: proves the agent loop on the skeleton. The agent
// reaches the worktree's MCP, binds the code its event listener printed, and
// is woken by the listener on the test event.

import type { Scenario } from '../scenario.ts'

const CODE_LINE = /polly event code: ([A-Za-z0-9_-]{43})\./
const EVENT_LINE = 'polly event test, handle it with the polly:lesson skill.'
const TOOL = 'mcp__plugin_polly_polly__'

interface Block {
  type?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

interface Entry {
  type?: string
  message?: { content?: unknown }
  attachment?: { type?: string; prompt?: string }
}

function entries(transcript: string): Entry[] {
  return transcript
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Entry)
}

function blocks(entry: Entry): Block[] {
  const content = entry.message?.content
  return Array.isArray(content) ? (content as Block[]) : []
}

// Whether the entry hands the line to the agent. A monitor line is first
// queued, then delivered: only the delivery reaches the agent.
function delivers(entry: Entry, line: string): boolean {
  if (entry.type === 'attachment') {
    return entry.attachment?.type === 'queued_command' && (entry.attachment.prompt ?? '').includes(line)
  }
  return (
    entry.type === 'user' &&
    typeof entry.message?.content === 'string' &&
    entry.message.content.includes(line)
  )
}

export const smoke: Scenario = {
  name: 'smoke',
  prompt: 'Start my Polly lesson.',
  done: (transcript) => smoke.failures(transcript).length === 0,
  failures: (transcript) => {
    const all = entries(transcript)
    const calls = all.flatMap(blocks).filter((block) => block.type === 'tool_use')
    const results = all.flatMap(blocks).filter((block) => block.type === 'tool_result')
    const code = CODE_LINE.exec(transcript)?.[1]
    const failures: string[] = []
    if (!calls.some(({ name, input }) => name === 'Skill' && input?.['skill'] === 'polly:lesson')) {
      failures.push('the polly:lesson skill was not invoked')
    }
    const whoami = calls.filter(({ name }) => name === `${TOOL}whoami`).map(({ id }) => id)
    if (whoami.length === 0) {
      failures.push('whoami was not called')
    } else if (
      !results.some(
        ({ tool_use_id, is_error, content }) =>
          whoami.includes(tool_use_id) && is_error !== true && JSON.stringify(content).includes('learnerId'),
      )
    ) {
      failures.push('whoami did not return a learner')
    }
    if (code === undefined) {
      failures.push('the monitor printed no event code')
    }
    if (
      !calls.some(
        ({ name, input }) => name === `${TOOL}start_lesson` && code !== undefined && input?.['code'] === code,
      )
    ) {
      failures.push('start_lesson was not called with the printed code')
    }
    const event = all.findIndex((entry) => delivers(entry, EVENT_LINE))
    if (event === -1) {
      failures.push('the test event never reached the agent')
    } else if (!all.slice(event + 1).some((entry) => entry.type === 'assistant')) {
      failures.push('the agent did not handle the test event')
    }
    return failures
  },
}
