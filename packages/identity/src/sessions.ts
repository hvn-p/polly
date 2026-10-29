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
  const nextOf = async (response: Response): Promise<string | undefined> => {
    const { url } = (await response.json().catch(() => ({}))) as { url?: unknown }
    return typeof url === 'string' ? url : undefined
  }
  return {
    signIn: async ({ email, password, oauthQuery }, headers) => {
      const response = await relay(
        '/sign-in/email',
        { email, password, ...(oauthQuery === undefined ? {} : { oauth_query: oauthQuery }) },
        headers,
      )
      if (response.status >= 500) {
        throw new Error(`the identity answered ${response.status} to a sign-in`)
      }
      if (!response.ok) {
        throw new Refusal('INVALID_EMAIL_OR_PASSWORD', 'this email and password do not match an account')
      }
      const next = await nextOf(response)
      return { ...(next === undefined ? {} : { next }), cookies: response.headers.getSetCookie() }
    },
    consent: async ({ accept, oauthQuery }, headers) => {
      const response = await relay('/oauth2/consent', { accept, oauth_query: oauthQuery }, headers)
      if (response.status === 401) {
        throw new Refusal('UNAUTHORIZED', 'sign in before answering an authorization request')
      }
      const next = response.ok ? await nextOf(response) : undefined
      if (response.status >= 500) {
        throw new Error(`the identity answered ${response.status} to a consent`)
      }
      if (next === undefined) {
        throw new Refusal(
          'INVALID_OAUTH_REQUEST',
          'this authorization request is missing, altered or expired',
        )
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
