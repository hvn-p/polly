// The contract of the agent-event stream between the API and the event
// listener (the plugin's monitor): the event code, the events, and the
// refusals, part of the API's contract (nr contracts).

import { EVENT_CODE_LENGTH, EVENT_CODE_PATTERN } from '@polly/kernel'
import { z } from 'zod'

export const eventCode = z.string().length(EVENT_CODE_LENGTH).regex(EVENT_CODE_PATTERN)

export const testEvent = z.object({ type: z.literal('test') })

export const agentEvent = z.discriminatedUnion('type', [testEvent])

export const refusalCode = z.enum([
  'UNAUTHORIZED',
  'INVALID_EVENT_CODE',
  'EVENT_CODE_REVOKED',
  'EVENT_CODE_NOT_BOUND',
  'EVENT_CODE_ALREADY_BOUND',
])

// A refusal's code, which the caller acts on, and its reason, for a person.
export const refusal = z.object({ code: refusalCode, reason: z.string().max(512).optional() })

export const schemas = { eventCode, agentEvent, refusal }
