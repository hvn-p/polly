// A learner's browser session: the sign-in and the consent of the web's own
// routes, relayed to Better Auth on the worktree's origin, and the learner a
// session cookie names. The web never reaches Better Auth itself.

import type { LearnerDirectory } from '@polly/back'
import { Refusal } from '@polly/platform'
import type { Identity } from './better-auth.ts'

export interface SignIn {
  email: string
  password: string
  // The sign-in page's query string: the authorization request Better Auth
  // signed when it sent the learner there, if any.
  oauthQuery?: string
}

export interface Consent {
  accept: boolean
  oauthQuery: string
}

export interface Sessions {
  // Where to go next when an authorization request is pending, and the
  // Set-Cookie values of the session.
  signIn: (input: SignIn, headers: Headers) => Promise<{ next?: string; cookies: string[] }>
  // The client's callback, with its code or its denial.
  consent: (input: Consent, headers: Headers) => Promise<{ next: string }>
  // The learner the request's session cookie names, if any.
  learnerOf: (headers: Headers) => Promise<string | undefined>
}

// The part of a page's query string the identity signed: the signature, the
// list of signed names (ba_param) and the parameters it names. Anything else
// the page received (a tracking parameter, say) would break the signature.
// Better Auth's own browser client sends the same; this relay does it for the
// web, which reaches only Polly's routes.
function signedPart(oauthQuery: string): string {
  const params = new URLSearchParams(oauthQuery)
  const signed = new Set(params.getAll('ba_param'))
  if (!params.has('sig') || signed.size === 0) {
    return oauthQuery
  }
  const kept = new URLSearchParams()
  for (const [name, value] of params) {
    if (name === 'sig' || name === 'ba_param' || signed.has(name)) {
      kept.append(name, value)
    }
  }
  return kept.toString()
}

// Better Auth's answer to an authorization request whose signature does not
// verify: altered, or expired.
const INVALID_SIGNATURE = 'invalid_signature'

const invalidRequest = () =>
  new Refusal('INVALID_OAUTH_REQUEST', 'this authorization request is missing, altered or expired')

// What Better Auth reads of the browser's request: its origin for its own
// cross-site check, its cookie for the session.
const RELAYED_HEADERS = ['origin', 'cookie', 'user-agent']

export function browserSessions(identity: Identity, publicUrl: string): Sessions {
  const relay = (path: string, body: Record<string, unknown>, headers: Headers): Promise<Response> => {
    const relayed = new Headers({ 'content-type': 'application/json' })
    for (const name of RELAYED_HEADERS) {
      const value = headers.get(name)
      if (value !== null) {
        relayed.set(name, value)
      }
    }
    return identity.handler(
      new Request(`${publicUrl}/api/auth${path}`, {
        method: 'POST',
        headers: relayed,
        body: JSON.stringify(body),
      }),
    )
  }
  const bodyOf = async (response: Response): Promise<{ url?: unknown; error?: unknown }> =>
    (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown }
  const nextOf = async (response: Response): Promise<string | undefined> => {
    const { url } = await bodyOf(response)
    return typeof url === 'string' ? url : undefined
  }
  return {
    signIn: async ({ email, password, oauthQuery }, headers) => {
      const response = await relay(
        '/sign-in/email',
        { email, password, ...(oauthQuery === undefined ? {} : { oauth_query: signedPart(oauthQuery) }) },
        headers,
      )
      if (response.status === 401) {
        throw new Refusal('INVALID_EMAIL_OR_PASSWORD', 'this email and password do not match an account')
      }
      if (response.status === 400 && (await bodyOf(response.clone())).error === INVALID_SIGNATURE) {
        throw invalidRequest()
      }
      if (!response.ok) {
        throw new Error(`the identity answered ${response.status} to a sign-in`)
      }
      const next = await nextOf(response)
      return { ...(next === undefined ? {} : { next }), cookies: response.headers.getSetCookie() }
    },
    consent: async ({ accept, oauthQuery }, headers) => {
      const response = await relay(
        '/oauth2/consent',
        { accept, oauth_query: signedPart(oauthQuery) },
        headers,
      )
      if (response.status === 401) {
        throw new Refusal('UNAUTHORIZED', 'sign in before answering an authorization request')
      }
      const next = response.ok ? await nextOf(response) : undefined
      if (response.status >= 500) {
        throw new Error(`the identity answered ${response.status} to a consent`)
      }
      if (next === undefined) {
        throw invalidRequest()
      }
      return { next }
    },
    learnerOf: async (headers) => (await identity.api.getSession({ headers }))?.user.id,
  }
}

// The back's directory port, over this identity.
export function learnerDirectory(identity: Identity): LearnerDirectory {
  return {
    nameOf: async (learnerId) => {
      const context = await identity.$context
      return (await context.internalAdapter.findUserById(learnerId))?.name
    },
  }
}
