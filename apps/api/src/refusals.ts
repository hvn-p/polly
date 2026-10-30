// The translation of a refusal into an HTTP response, the one place it is
// built: routes and access rules throw a Refusal; scripts/checks/refusals.mjs
// keeps them from building their own.

import { Refusal } from '@polly/platform'

// A refusal not listed here depends on the state of something: 409.
const HTTP_STATUS: Record<string, number> = {
  INVALID_EVENT_CODE: 400,
  INVALID_OAUTH_REQUEST: 400,
  UNAUTHORIZED: 401,
  INVALID_EMAIL_OR_PASSWORD: 401,
  EVENT_CODE_REVOKED: 403,
}

// A path no route serves: no refusal of the contract, so no code.
export function notFoundResponse(): Response {
  return new Response(null, { status: 404 })
}

// An unauthenticated request: UNAUTHORIZED, with the challenge whose
// resource metadata starts the OAuth flow.
export function challengeResponse(challenge: string): Response {
  const response = refusalResponse(new Refusal('UNAUTHORIZED', 'sign in to Polly through OAuth'))
  response.headers.set('www-authenticate', challenge)
  return response
}

export function refusalResponse(refusal: Refusal): Response {
  return Response.json(
    { code: refusal.code, reason: refusal.message },
    { status: HTTP_STATUS[refusal.code] ?? 409 },
  )
}
