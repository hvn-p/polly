// The `learner` access rule: admits a request carrying an access token issued
// by this worktree for the route's resource, or the session cookie of the
// learner's browser; anything else gets the 401 whose WWW-Authenticate header
// starts the OAuth flow. A request its cookie admits that changes state must
// come from the worktree's origin: the cookie is SameSite=Lax, which still
// lets some cross-site requests carry it.

import { Refusal } from '@polly/platform'
import { challengeResponse } from './refusals.ts'
import type { Guard } from './routes.ts'

// Which learner makes a request, or the challenge (a WWW-Authenticate value)
// refusing it: the identity's port, built by the composition root once the
// server's JWKS URL is known.
export type Authenticate = (request: Request) => Promise<{ learnerId: string } | { challenge: string }>

// The learner a browser's session cookie names, if any.
export type SessionLearner = (headers: Headers) => Promise<string | undefined>

const SAFE_METHODS = new Set(['GET', 'HEAD'])

export function learnerGuard(
  authenticate: Authenticate,
  sessionLearner: SessionLearner,
  origin: string,
): Guard<'learner'> {
  return async (request) => {
    const learnerId =
      request.headers.has('authorization') || !request.headers.has('cookie')
        ? undefined
        : await sessionLearner(request.headers)
    if (learnerId === undefined) {
      const outcome = await authenticate(request)
      return 'challenge' in outcome ? challengeResponse(outcome.challenge) : outcome
    }
    if (!SAFE_METHODS.has(request.method) && request.headers.get('origin') !== origin) {
      throw new Refusal('UNAUTHORIZED', "a request signed in by its cookie comes from the worktree's origin")
    }
    return { learnerId }
  }
}
