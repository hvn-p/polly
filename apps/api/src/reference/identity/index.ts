// The identity of a learner: Better Auth, which is also the OAuth 2.1
// authorization server of the MCP. Polly's code reaches it only through the
// options built here and the instance they create.

import { cimd } from '@better-auth/cimd'
import { mcp } from '@better-auth/mcp'
import type { LearnerAccount, LearnerAccounts } from '@polly/back'
import { BASE_ERROR_CODES, type BetterAuthOptions, betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { jwt } from 'better-auth/plugins'
import type { Kysely } from 'kysely'

type ClientMetadataResourceFetch = Parameters<typeof cimd>[0]['fetchClientMetadataResource']

export interface IdentitySettings {
  publicUrl: string
  secret: string
  // biome-ignore lint/suspicious/noExplicitAny: Better Auth owns the shape of its tables.
  db: Kysely<any>
  fetchClientMetadataResource: ClientMetadataResourceFetch
}

export function mcpResource(publicUrl: string): string {
  return `${publicUrl}/mcp`
}

// The longest address SMTP carries (RFC 5321).
const MAX_EMAIL_LENGTH = 254

// The sign-in form's bounds, checked by the API (constitution principle XVI):
// Better Auth checks an email's format but not its length, and a password's
// length on sign-up only.
const signInBounds = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/sign-in/email') {
    return
  }
  const { email, password } = (ctx.body ?? {}) as { email?: unknown; password?: unknown }
  const { minPasswordLength, maxPasswordLength } = ctx.context.password.config
  if (typeof email === 'string' && email.length > MAX_EMAIL_LENGTH) {
    throw APIError.from('BAD_REQUEST', BASE_ERROR_CODES.INVALID_EMAIL)
  }
  if (typeof password === 'string' && password.length < minPasswordLength) {
    throw APIError.from('BAD_REQUEST', BASE_ERROR_CODES.PASSWORD_TOO_SHORT)
  }
  if (typeof password === 'string' && password.length > maxPasswordLength) {
    throw APIError.from('BAD_REQUEST', BASE_ERROR_CODES.PASSWORD_TOO_LONG)
  }
})

export function identityOptions(settings: IdentitySettings) {
  return {
    baseURL: settings.publicUrl,
    secret: settings.secret,
    database: { db: settings.db, type: 'postgres' },
    emailAndPassword: { enabled: true, disableSignUp: true },
    hooks: { before: signInBounds },
    plugins: [
      jwt(),
      mcp({
        loginPage: '/sign-in',
        consentPage: '/consent',
        resource: mcpResource(settings.publicUrl),
      }),
      cimd({
        fetchClientMetadataResource: settings.fetchClientMetadataResource,
        metadataProfile: 'mcp-2026-07-28',
      }),
    ],
  } satisfies BetterAuthOptions
}

export function createIdentity(settings: IdentitySettings) {
  return betterAuth(identityOptions(settings))
}

export type Identity = ReturnType<typeof createIdentity>

// Creates a learner's account on the server side, since public sign-up is
// closed. An existing account is kept as it is. Returns the learner's id.
export async function createLearnerAccount(identity: Identity, account: LearnerAccount): Promise<string> {
  const context = await identity.$context
  const existing = await context.internalAdapter.findUserByEmail(account.email)
  if (existing !== null) {
    return existing.user.id
  }
  const user = await context.internalAdapter.createUser(
    { name: account.name, email: account.email, emailVerified: true },
    { method: 'admin' },
  )
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await context.password.hash(account.password),
  })
  return user.id
}

// The back's accounts port, over this identity.
export function learnerAccounts(identity: Identity): LearnerAccounts {
  return { create: (account) => createLearnerAccount(identity, account) }
}
