// The contract of the agent-event stream between the API and the event
// listener (the plugin's monitor): the event code, the events, and the
// refusals. Its other consumers read the JSON Schema generated from it
// (nr contracts).

import { z } from 'zod'

// 32 random bytes, base64url: exactly 43 characters.
export const eventCode = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

export const testEvent = z.object({ type: z.literal('test') })

export const agentEvent = z.discriminatedUnion('type', [testEvent])

export const refusalCode = z.enum([
  'UNAUTHORIZED',
  'INVALID_EVENT_CODE',
  'EVENT_CODE_REVOKED',
  'EVENT_CODE_NOT_BOUND',
  'EVENT_CODE_ALREADY_BOUND',
])

export const refusal = z.object({ code: refusalCode })

export const schemas = { eventCode, agentEvent, refusal }
