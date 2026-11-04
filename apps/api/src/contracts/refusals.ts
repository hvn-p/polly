// The API's refusals, part of its contract (nr contracts): the one list of
// codes a caller acts on, each with the HTTP status that answers it. Each
// operation names the ones it may answer, and its refusal body is this schema
// with its code narrowed to them.

import { z } from 'zod'

export const REFUSAL_STATUS = {
  UNAUTHORIZED: 401,
  INVALID_EMAIL_OR_PASSWORD: 401,
  INVALID_OAUTH_REQUEST: 400,
  INVALID_EVENT_CODE: 400,
  EVENT_CODE_REVOKED: 403,
  // Ends the agent-event stream, never answered as a response: the status of a
  // refusal that depends on state, should one ever be.
  EVENT_CODE_NOT_BOUND: 409,
  EVENT_CODE_ALREADY_BOUND: 409,
} as const

// A path no route serves: no refusal of the contract, so no body.
export const UNROUTED_STATUS = 404

// An unexpected failure: no refusal of the contract, so no body.
export const UNEXPECTED_STATUS = 500

export type RefusalCode = keyof typeof REFUSAL_STATUS

export const refusalCode = z.enum(Object.keys(REFUSAL_STATUS) as [RefusalCode, ...RefusalCode[]])

// A refusal's code, which the caller acts on, and its reason, for a person.
export const refusal = z.object({ code: refusalCode, reason: z.string().max(512).optional() })
