#!/usr/bin/env node
// The plugin's event listener: draws an event code, prints it for the agent
// to bind with start_lesson, and holds the worktree's agent-event stream open
// with that code in a header. Each event becomes one line for the agent, its
// data inside a delimited field the polly:lesson skill treats as content.
// Writes nothing to disk; prints its code nowhere but its code line. Bundled
// with the contract's client into plugin/monitors/ (nr bundles).

import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { STREAMS } from '@polly/contract'

const RECONNECT_DELAY_MS = 2000
const UNCONFIGURED_URL = 'https://unconfigured.invalid/api/agent-events'

const EVENT_TYPES: ReadonlySet<unknown> = new Set(STREAMS.agentEvents.events)
const REFUSALS: ReadonlySet<unknown> = new Set(STREAMS.agentEvents.refusals)
// Refusals a new code answers; any other ending is retried with the same code.
const NEEDS_NEW_CODE = new Set(['EVENT_CODE_REVOKED', 'INVALID_EVENT_CODE'])

function say(line: string): void {
  process.stdout.write(`${line}\n`)
}

function drawCode(): string {
  const code = randomBytes(32).toString('base64url')
  say(`polly event code: ${code}. Bind it with the start_lesson tool of the polly MCP server.`)
  return code
}

// JSON that cannot close its field: `<` and `>` are escaped, which JSON keeps
// as the same characters.
function fieldOf(data: unknown): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')
}

// Reads one connection until it ends; returns the refusal code that ended it,
// if any.
async function listen(url: string, code: string): Promise<string | undefined> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${code}` } })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: unknown }
    return typeof body.code === 'string' && REFUSALS.has(body.code) ? body.code : undefined
  }
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of (response.body ?? []) as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')
      const event = /^event: (.*)$/m.exec(frame)?.[1]
      const data = /^data: (.*)$/m.exec(frame)?.[1]
      if (event === undefined || data === undefined) {
        continue
      }
      let parsed: { type?: unknown; code?: unknown }
      try {
        parsed = JSON.parse(data) as typeof parsed
      } catch {
        continue
      }
      if (event === 'error' && typeof parsed.code === 'string' && REFUSALS.has(parsed.code)) {
        return parsed.code
      }
      if (typeof parsed.type === 'string' && EVENT_TYPES.has(parsed.type)) {
        say(
          `polly event ${parsed.type}, handle it with the polly:lesson skill. <polly-event-data>${fieldOf(parsed)}</polly-event-data>`,
        )
      }
    }
  }
  return undefined
}

// The code line comes first in every case: the agent reads it there.
let code = drawCode()
const configured = process.env['POLLY_EVENTS_URL']
if (configured === undefined || configured === '') {
  say('WORKTREE_NOT_CONFIGURED: run nr dev:up, then restart the session with nr agent')
}
const url = configured || UNCONFIGURED_URL
for (;;) {
  let ending: string | undefined
  try {
    ending = await listen(url, code)
  } catch {
    ending = undefined
  }
  if (ending !== undefined && NEEDS_NEW_CODE.has(ending)) {
    code = drawCode()
    continue
  }
  await sleep(RECONNECT_DELAY_MS)
}
