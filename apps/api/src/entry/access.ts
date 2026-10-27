// The access rules of the routes. `learner` admits a request carrying an MCP
// access token issued by this worktree for its MCP resource; anything else
// gets a 401 whose WWW-Authenticate header starts the OAuth flow.

import { requireMcpAuth } from '@better-auth/mcp'
import { type Identity, mcpResource } from '../reference/identity/index.ts'
import type { Guard } from './routes.ts'

export function learnerGuard(identity: Identity, publicUrl: string, jwksUrl: () => string): Guard<'learner'> {
  // The learner each admitted request was issued to, by request.
  const admitted = new WeakMap<Request, string>()
  let protect: ((request: Request) => Promise<Response>) | undefined
  return async (request) => {
    // Built on the first request: the JWKS URL names the port the server
    // listens on, known once it listens. The JWKS is read on loopback, never
    // through the worktree's public URL.
    protect ??= requireMcpAuth(
      identity,
      async (verified, claims) => {
        if (typeof claims.sub === 'string') {
          admitted.set(verified, claims.sub)
        }
        return new Response(null, { status: 204 })
      },
      { resource: mcpResource(publicUrl), jwksUrl: jwksUrl() },
    )
    const response = await protect(request)
    const learnerId = admitted.get(request)
    return learnerId === undefined ? response : { learnerId }
  }
}
