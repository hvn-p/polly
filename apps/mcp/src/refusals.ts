// The MCP server's refusals, the one place each is built, with the status the
// API's contract gives it: an API refusal as a tool error starting with its
// code, which the agent acts on; a request whose token does not exchange as
// UNAUTHORIZED, whose WWW-Authenticate header points the client at the OAuth
// flow; any other path as not found, with no body.

import type { CallToolResult } from '@modelcontextprotocol/server'
import { type Outcome, refusalStatus, UNEXPECTED_STATUS, UNROUTED_STATUS } from '@polly/contract'
import { Refusal } from '@polly/platform'

export function toolResult<T extends Record<string, unknown>>(outcome: Outcome<T>): CallToolResult {
  if (!outcome.ok) {
    const reason = outcome.reason === undefined ? '' : `: ${outcome.reason}`
    return { isError: true, content: [{ type: 'text', text: `${outcome.code}${reason}` }] }
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(outcome.value) }],
    structuredContent: outcome.value,
  }
}

export function unauthorized(publicUrl: string): Response {
  const response = refusedRequest(new Refusal('UNAUTHORIZED', 'sign in to Polly through OAuth'))
  response.headers.set(
    'www-authenticate',
    `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp"`,
  )
  return response
}

// A refusal an access rule or a route throws: its code and reason.
export function refusedRequest(refusal: Refusal): Response {
  return Response.json(
    { code: refusal.code, reason: refusal.message },
    { status: refusalStatus(refusal.code) },
  )
}

// No refusal of the contract, so no code.
export function notFound(): Response {
  return new Response(null, { status: UNROUTED_STATUS })
}

// An unexpected failure: no refusal of the contract, so no code.
export function unexpected(): Response {
  return new Response(null, { status: UNEXPECTED_STATUS })
}
