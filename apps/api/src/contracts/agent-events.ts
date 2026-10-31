// The contract of the agent-event stream between the API and the event
// listener (the plugin's monitor): the event code and the events, part of the
// API's contract (nr contracts); its refusals are the API's.

import { EVENT_CODE_LENGTH, EVENT_CODE_PATTERN } from '@polly/kernel'
import { z } from 'zod'

export const eventCode = z.string().length(EVENT_CODE_LENGTH).regex(EVENT_CODE_PATTERN)

export const testEvent = z.object({ type: z.literal('test') })

export const agentEvent = z.discriminatedUnion('type', [testEvent])

export const schemas = { eventCode, agentEvent }
