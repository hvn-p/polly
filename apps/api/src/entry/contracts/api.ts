// The API's contract with its interfaces (the web front end, the MCP server, the
// event listener): its operations, what each takes and gives, and the refusals
// each may answer. nr contracts writes from it the OpenAPI document and the
// client of packages/contract; the routes are registered from it.

import { z } from 'zod'
import { agentEvent, eventCode, refusal } from './agent-events.ts'

export const learner = z.object({ learnerId: z.string().min(1).max(64) })
export const eventCodeBinding = z.object({ code: eventCode })
export const bound = z.object({ bound: z.literal(true) })

export const schemas = {
  Learner: learner,
  EventCodeBinding: eventCodeBinding,
  Bound: bound,
  AgentEvent: agentEvent,
  Refusal: refusal,
}

export const operations = {
  getMe: {
    method: 'GET',
    path: '/api/me',
    access: 'learner',
    response: learner,
    refusals: ['UNAUTHORIZED'],
  },
  bindEventCode: {
    method: 'POST',
    path: '/api/event-codes',
    access: 'learner',
    body: eventCodeBinding,
    response: bound,
    refusals: ['UNAUTHORIZED', 'INVALID_EVENT_CODE', 'EVENT_CODE_ALREADY_BOUND', 'EVENT_CODE_REVOKED'],
  },
  agentEvents: {
    method: 'GET',
    path: '/api/agent-events',
    access: 'event-code',
    events: agentEvent,
    refusals: ['UNAUTHORIZED', 'INVALID_EVENT_CODE', 'EVENT_CODE_REVOKED', 'EVENT_CODE_NOT_BOUND'],
  },
} as const
