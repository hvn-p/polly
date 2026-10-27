// The smoke scenario: proves the agent loop on the skeleton. The agent
// reaches the worktree's MCP, binds the code its event listener printed, and
// is woken by the listener on the test event.

import type { Scenario } from '../scenario.ts'

const CODE_LINE = /polly event code: ([A-Za-z0-9_-]{43})\./
const TOOL = 'mcp__plugin_polly_polly__'

interface Entry {
  message?: { content?: unknown }
}

function toolCalls(transcript: string): { name: string; input: Record<string, unknown> }[] {
  return transcript
    .split('\n')
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      const content = (JSON.parse(line) as Entry).message?.content
      return Array.isArray(content)
        ? content
            .filter((block) => block?.type === 'tool_use')
            .map((block) => ({ name: block.name, input: block.input ?? {} }))
        : []
    })
}

export const smoke: Scenario = {
  name: 'smoke',
  prompt: 'Start my Polly lesson.',
  done: (transcript) => smoke.failures(transcript).length === 0,
  failures: (transcript) => {
    const calls = toolCalls(transcript)
    const code = CODE_LINE.exec(transcript)?.[1]
    const failures: string[] = []
    if (!calls.some(({ name, input }) => name === 'Skill' && input['skill'] === 'polly:lesson')) {
      failures.push('the polly:lesson skill was not invoked')
    }
    if (!calls.some(({ name }) => name === `${TOOL}whoami`)) {
      failures.push('whoami was not called')
    }
    if (code === undefined) {
      failures.push('the monitor printed no event code')
    }
    if (
      !calls.some(
        ({ name, input }) => name === `${TOOL}start_lesson` && code !== undefined && input['code'] === code,
      )
    ) {
      failures.push('start_lesson was not called with the printed code')
    }
    if (!transcript.includes('polly event test, handle it with the polly:lesson skill.')) {
      failures.push('the test event never reached the agent')
    }
    return failures
  },
}
