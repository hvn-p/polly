// The translation of the contract into HTTP, the one place an answer is built:
// a route's value, its stream and that stream's frames, and a refusal, each
// with the status the contract gives it. Routes and access rules throw a
// Refusal; scripts/checks/refusals.mjs keeps every other file from building an
// answer or writing a status.

import { Refusal } from '@polly/platform'
import { REFUSAL_STATUS, UNROUTED_STATUS } from './contracts/refusals.ts'

// What the contract states of an operation's success.
interface Succeeds {
  readonly status: number
}

// What the contract states of a stream's ending refusal.
interface EndsWithRefusal {
  readonly error: { readonly event: string; readonly refusals: readonly string[] }
}

function statusOf(code: string): number {
  if (!Object.hasOwn(REFUSAL_STATUS, code)) {
    throw new Error(`${code} is no refusal of the contract`)
  }
  return REFUSAL_STATUS[code as keyof typeof REFUSAL_STATUS]
}

// A path no route serves: no refusal of the contract, so no code.
export function notFoundResponse(): Response {
  return new Response(null, { status: UNROUTED_STATUS })
}

// An unauthenticated request: UNAUTHORIZED, with the challenge whose
// resource metadata starts the OAuth flow.
export function challengeResponse(challenge: string): Response {
  const response = refusalResponse(new Refusal('UNAUTHORIZED', 'sign in to Polly through OAuth'))
  response.headers.set('www-authenticate', challenge)
  return response
}

export function refusalResponse(refusal: Refusal): Response {
  return Response.json({ code: refusal.code, reason: refusal.message }, { status: statusOf(refusal.code) })
}

// An operation's value, with the cookies the answer sets.
export function answer(operation: Succeeds, value: unknown, cookies: readonly string[] = []): Response {
  const response = Response.json(value, { status: operation.status })
  for (const cookie of cookies) {
    response.headers.append('set-cookie', cookie)
  }
  return response
}

export function streamResponse(operation: Succeeds, body: ReadableStream<Uint8Array>): Response {
  return new Response(body, {
    status: operation.status,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
  })
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function eventFrame(event: { type: string }): string {
  return frame(event.type, event)
}

export function keepaliveFrame(): string {
  return ': keepalive\n\n'
}

// The frame that ends a stream with one of the refusals its contract lists.
export function refusalFrame(stream: EndsWithRefusal, refusal: Refusal): string {
  if (!stream.error.refusals.includes(refusal.code)) {
    throw new Error(`${refusal.code} does not end this stream`)
  }
  return frame(stream.error.event, { code: refusal.code, reason: refusal.message })
}
