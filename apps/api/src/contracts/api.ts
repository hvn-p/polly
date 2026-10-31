// The API's contract with its interfaces (the web front end, the MCP server, the
// event listener): its operations, what each takes and gives, and the refusals
// each may answer. nr contracts writes from it the OpenAPI document and the
// client of packages/contract; the routes are registered from it.

import { z } from 'zod'
import { agentEvent, eventCode } from './agent-events.ts'
import { REFUSAL_STATUS, type RefusalCode, refusal, UNEXPECTED_STATUS, UNROUTED_STATUS } from './refusals.ts'

export const learner = z.object({ learnerId: z.string().min(1).max(64), name: z.string().min(1).max(256) })

// The query string of the sign-in or consent page: the authorization request
// the identity signed when it sent the learner there.
const oauthQuery = z.string().max(4096)
// Where the browser goes next: a path of the worktree's origin, or a client's
// callback.
const next = z.string().min(1).max(2048)

export const signInRequest = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(8).max(128),
  oauthQuery: oauthQuery.optional(),
})
export const signedIn = z.object({ next: next.optional() })
export const consentRequest = z.object({ accept: z.boolean(), oauthQuery })
export const consented = z.object({ next })
export const eventCodeBinding = z.object({ code: eventCode })
export const bound = z.object({ bound: z.literal(true) })

export const schemas = {
  Learner: learner,
  SignInRequest: signInRequest,
  SignedIn: signedIn,
  ConsentRequest: consentRequest,
  Consented: consented,
  EventCodeBinding: eventCodeBinding,
  Bound: bound,
  AgentEvent: agentEvent,
  Refusal: refusal,
}

export const operations = {
  signIn: {
    method: 'POST',
    path: '/api/sign-in',
    access: 'public',
    status: 200,
    body: signInRequest,
    response: signedIn,
    refusals: ['INVALID_EMAIL_OR_PASSWORD', 'INVALID_OAUTH_REQUEST'],
  },
  consent: {
    method: 'POST',
    path: '/api/consent',
    access: 'learner',
    status: 200,
    body: consentRequest,
    response: consented,
    refusals: ['UNAUTHORIZED', 'INVALID_OAUTH_REQUEST'],
  },
  getMe: {
    method: 'GET',
    path: '/api/me',
    access: 'learner',
    status: 200,
    response: learner,
    refusals: ['UNAUTHORIZED'],
  },
  bindEventCode: {
    method: 'POST',
    path: '/api/event-codes',
    access: 'learner',
    status: 200,
    body: eventCodeBinding,
    response: bound,
    refusals: ['UNAUTHORIZED', 'INVALID_EVENT_CODE', 'EVENT_CODE_ALREADY_BOUND', 'EVENT_CODE_REVOKED'],
  },
  agentEvents: {
    method: 'GET',
    path: '/api/agent-events',
    access: 'event-code',
    status: 200,
    events: agentEvent,
    // The event that ends the stream with a refusal, its data a Refusal.
    error: { event: 'error', refusals: ['EVENT_CODE_NOT_BOUND'] },
    refusals: ['UNAUTHORIZED', 'INVALID_EVENT_CODE', 'EVENT_CODE_REVOKED'],
  },
} as const satisfies Record<
  string,
  {
    readonly status: number
    readonly refusals: readonly RefusalCode[]
    readonly error?: { readonly event: string; readonly refusals: readonly RefusalCode[] }
    readonly [key: string]: unknown
  }
>

export const statuses = { refusals: REFUSAL_STATUS, unrouted: UNROUTED_STATUS, unexpected: UNEXPECTED_STATUS }
