// The identity capacity: who a learner is and which learner makes a request,
// with Better Auth and its OAuth provider, the token exchange included. A
// process's composition root builds it and hands its ports to the routes.

import { requireMcpAuth } from '@better-auth/mcp'
import type { Identity } from './better-auth.ts'

export {
  apiResource,
  createIdentity,
  createLearnerAccount,
  type Identity,
  type IdentitySettings,
  identityOptions,
  learnerAccounts,
  mcpResource,
  registerMcpClient,
} from './better-auth.ts'
export { browserSessions, type Consent, learnerDirectory, type Sessions, type SignIn } from './sessions.ts'
export { MCP_CLIENT_ID, TOKEN_EXCHANGE_GRANT } from './token-exchange.ts'

// Which learner makes a request for this resource: the learner its bearer
// token was issued to, or the 401 whose WWW-Authenticate header starts the
// OAuth flow. Keys are read at `jwksUrl`, on the address the server listens on.
export function authenticator(
  identity: Identity,
  resource: string,
  jwksUrl: () => string,
): (request: Request) => Promise<{ learnerId: string } | Response> {
  const admitted = new WeakMap<Request, string>()
  let protect: ((request: Request) => Promise<Response>) | undefined
  return async (request) => {
    // Built on the first request: the JWKS URL names the port the server
    // listens on, known once it listens.
    protect ??= requireMcpAuth(
      identity,
      async (verified, claims) => {
        if (typeof claims.sub === 'string') {
          admitted.set(verified, claims.sub)
        }
        return new Response(null, { status: 204 })
      },
      { resource, jwksUrl: jwksUrl() },
    )
    const response = await protect(request)
    const learnerId = admitted.get(request)
    return learnerId === undefined ? response : { learnerId }
  }
}
