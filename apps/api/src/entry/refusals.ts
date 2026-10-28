// The translations of a refusal, the one place each is built: into an HTTP
// response for a route, into a tool error for an MCP tool. Routes, access
// rules and tools throw a Refusal; scripts/checks/refusals.mjs keeps them from
// building their own.

import type { CallToolResult } from '@modelcontextprotocol/server'
import type { Refusal } from '@polly/platform'

// A refusal not listed here depends on the state of something: 409.
const HTTP_STATUS: Record<string, number> = {
  INVALID_EVENT_CODE: 400,
  UNAUTHORIZED: 401,
  EVENT_CODE_REVOKED: 403,
  NOT_FOUND: 404,
}

export function refusalResponse(refusal: Refusal): Response {
  return Response.json({ code: refusal.code }, { status: HTTP_STATUS[refusal.code] ?? 409 })
}

// Its text starts with the code, which the agent acts on.
export function toolRefusal(refusal: Refusal): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: refusal.text }] }
}
