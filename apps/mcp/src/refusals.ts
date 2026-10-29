// The MCP server's refusals, the one place each is built: an API refusal as a
// tool error starting with its code, which the agent acts on; a request whose
// token does not exchange as the 401 whose WWW-Authenticate header points the
// client at the OAuth flow; any other path as not found, with no body.

import type { CallToolResult } from '@modelcontextprotocol/server'
import type { Outcome } from '@polly/contract'

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
  return Response.json(
    { code: 'UNAUTHORIZED', reason: 'sign in to Polly through OAuth' },
    {
      status: 401,
      headers: {
        'www-authenticate': `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp"`,
      },
    },
  )
}

// No refusal of the contract, so no code.
export function notFound(): Response {
  return new Response(null, { status: 404 })
}
