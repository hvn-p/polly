// The browser's session routes of the contract: the sign-in and the consent of
// the web's pages, relayed to the identity, which sets the session cookie and
// resumes the authorization request the pages carry. The web knows no identity
// provider: it reaches these routes through the contract's client.

import { Refusal } from '@polly/platform'
import { consentRequest, operations, signInRequest } from '../contracts/api.ts'
import { answer } from '../refusals.ts'
import type { RouteRegistry } from '../routes.ts'

// The identity's session port, built by the composition root.
export interface BrowserSessions {
  signIn: (
    input: { email: string; password: string; oauthQuery?: string },
    headers: Headers,
  ) => Promise<{ next?: string; cookies: string[] }>
  consent: (input: { accept: boolean; oauthQuery: string }, headers: Headers) => Promise<{ next: string }>
}

async function bodyOf(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined)
}

export function registerSessionRoutes(registry: RouteRegistry, sessions: BrowserSessions): void {
  const { signIn, consent } = operations
  registry.add({
    method: signIn.method,
    path: signIn.path,
    access: signIn.access,
    handle: async (request) => {
      // Out of bounds, a pair cannot match an account: the same refusal.
      const parsed = signInRequest.safeParse(await bodyOf(request))
      if (!parsed.success) {
        throw new Refusal('INVALID_EMAIL_OR_PASSWORD', 'this email and password do not match an account')
      }
      const { email, password, oauthQuery } = parsed.data
      const { next, cookies } = await sessions.signIn(
        { email, password, ...(oauthQuery === undefined ? {} : { oauthQuery }) },
        request.headers,
      )
      return answer(signIn, next === undefined ? {} : { next }, cookies)
    },
  })
  registry.add({
    method: consent.method,
    path: consent.path,
    access: consent.access,
    handle: async (request) => {
      const parsed = consentRequest.safeParse(await bodyOf(request))
      if (!parsed.success) {
        throw new Refusal(
          'INVALID_OAUTH_REQUEST',
          'this authorization request is missing, altered or expired',
        )
      }
      return answer(consent, await sessions.consent(parsed.data, request.headers))
    },
  })
}
