#!/usr/bin/env node
// The plugin's event listener: draws an event code, prints it for the agent
// to bind with start_lesson, and holds the worktree's agent-event stream open
// with that code in a header. Each event becomes one line for the agent, its
// data inside a delimited field the polly:lesson skill treats as content.
// Writes nothing to disk; prints its code nowhere but its code line.

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const RECONNECT_DELAY_MS = 2000
const UNCONFIGURED_URL = 'https://unconfigured.invalid/api/agent-events'

/** @type {{ $defs: { agentEvent: { oneOf: { properties: { type: { const: string } } }[] }, refusal: { properties: { code: { enum: string[] } } } } }} */
const contract = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'contracts', 'agent-events.schema.json'), 'utf8'),
)
const EVENT_TYPES = new Set(contract.$defs.agentEvent.oneOf.map((event) => event.properties.type.const))
const REFUSALS = new Set(contract.$defs.refusal.properties.code.enum)
// Refusals a new code answers; any other ending is retried with the same code.
const NEEDS_NEW_CODE = new Set(['EVENT_CODE_REVOKED', 'INVALID_EVENT_CODE'])

/** @param {string} line */
function say(line) {
  process.stdout.write(`${line}\n`)
}

function drawCode() {
  const code = randomBytes(32).toString('base64url')
  say(`polly event code: ${code}. Bind it with the start_lesson tool of the polly MCP server.`)
  return code
}

// JSON that cannot close its field: `<` and `>` are escaped, which JSON keeps
// as the same characters.
/** @param {unknown} data */
function fieldOf(data) {
  return JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')
}

/**
 * Reads one connection until it ends; returns the refusal code that ended it,
 * if any.
 * @param {string} url
 * @param {string} code
 * @returns {Promise<string | undefined>}
 */
async function listen(url, code) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${code}` } })
  if (!response.ok) {
    const body = /** @type {{ code?: unknown }} */ (await response.json().catch(() => ({})))
    return typeof body.code === 'string' && REFUSALS.has(body.code) ? body.code : undefined
  }
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of /** @type {AsyncIterable<Uint8Array>} */ (response.body ?? [])) {
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
      /** @type {{ type?: unknown, code?: unknown }} */
      let parsed
      try {
        parsed = JSON.parse(data)
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
  let ending
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
