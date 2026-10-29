// The translation of a refusal into an HTTP response, the one place it is
// built: routes and access rules throw a Refusal; scripts/checks/refusals.mjs
// keeps them from building their own.

import type { Refusal } from '@polly/platform'

// A refusal not listed here depends on the state of something: 409.
const HTTP_STATUS: Record<string, number> = {
  INVALID_EVENT_CODE: 400,
  UNAUTHORIZED: 401,
  EVENT_CODE_REVOKED: 403,
}

// A path no route serves: no refusal of the contract, so no code.
export function notFoundResponse(): Response {
  return new Response(null, { status: 404 })
}

export function refusalResponse(refusal: Refusal): Response {
  return Response.json(
    { code: refusal.code, reason: refusal.message },
    { status: HTTP_STATUS[refusal.code] ?? 409 },
  )
}
