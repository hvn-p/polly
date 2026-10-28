// The `learner` access rule: admits a request carrying an access token issued
// by this worktree for the route's resource; anything else gets the 401 whose
// WWW-Authenticate header starts the OAuth flow.

import type { Guard } from './routes.ts'

// Which learner makes a request, or the response refusing it: the identity's
// port, built by the composition root once the server's JWKS URL is known.
export type Authenticate = (request: Request) => Promise<{ learnerId: string } | Response>

export function learnerGuard(authenticate: Authenticate): Guard<'learner'> {
  return async (request) => authenticate(request)
}
