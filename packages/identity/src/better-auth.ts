// The identity of a learner: Better Auth, which is also the OAuth 2.1
// authorization server of the MCP and of the API. Polly's code reaches it only
// through the ports of index.ts.

import { cimd } from '@better-auth/cimd'
import { fetchClientMetadataResource as fetchOverNetwork } from '@better-auth/cimd/node'
import { mcp } from '@better-auth/mcp'
import type { LearnerAccount, LearnerAccounts } from '@polly/back'
import { BASE_ERROR_CODES, type BetterAuthOptions, betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { jwt } from 'better-auth/plugins'
import type { Kysely } from 'kysely'
import { hashSecret, MCP_CLIENT_ID, TOKEN_EXCHANGE_GRANT, tokenExchange } from './token-exchange.ts'

type ClientMetadataResourceFetch = Parameters<typeof cimd>[0]['fetchClientMetadataResource']

export interface IdentitySettings {
  publicUrl: string
  secret: string
  // biome-ignore lint/suspicious/noExplicitAny: Better Auth owns the shape of its tables.
  db: Kysely<any>
  // How a client's metadata document is fetched: over the network unless a test
  // injects a fetch that never reaches it.
  fetchClientMetadataResource?: ClientMetadataResourceFetch
}

export function mcpResource(publicUrl: string): string {
  return `${publicUrl}/mcp`
}

// The API as a protected resource: what an exchanged token names as audience.
export function apiResource(publicUrl: string): string {
  return `${publicUrl}/api`
}

// An exchanged token lives 5 minutes: the MCP server exchanges again for each
// call, and a JWT cannot be revoked before it expires.
const API_TOKEN_SECONDS = 300

// The sign-in form's bounds: a copy of the API contract's, which this tier
// cannot import; a test of the API holds it equal. 254 is the longest address
// SMTP carries (RFC 5321).
export const SIGN_IN_BOUNDS = { email: { max: 254 }, password: { min: 8, max: 128 } } as const

// The sign-in form's bounds, checked by the API (constitution principle XVI):
// Better Auth checks an email's format but not its length, and a password's
// length on sign-up only.
const signInBounds = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/sign-in/email') {
    return
  }
  const { email, password } = (ctx.body ?? {}) as { email?: unknown; password?: unknown }
  const { minPasswordLength, maxPasswordLength } = ctx.context.password.config
  if (typeof email === 'string' && email.length > SIGN_IN_BOUNDS.email.max) {
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
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: SIGN_IN_BOUNDS.password.min,
      maxPasswordLength: SIGN_IN_BOUNDS.password.max,
    },
    hooks: { before: signInBounds },
    plugins: [
      jwt(),
      mcp({
        loginPage: '/sign-in',
        consentPage: '/consent',
        resource: mcpResource(settings.publicUrl),
        resources: [{ identifier: apiResource(settings.publicUrl), accessTokenTtl: API_TOKEN_SECONDS }],
        extensions: [
          tokenExchange({ mcp: mcpResource(settings.publicUrl), api: apiResource(settings.publicUrl) }),
        ],
        storeClientSecret: { hash: hashSecret },
      }),
      cimd({
        fetchClientMetadataResource: settings.fetchClientMetadataResource ?? fetchOverNetwork,
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

// Records the MCP server as a confidential client allowed the token exchange
// only, linked to the API resource, with the configured secret. Run at each
// start of the API, so a new secret replaces the old one; several processes
// starting at once each find the rows another created.
export async function registerMcpClient(
  identity: Identity,
  publicUrl: string,
  secret: string,
): Promise<void> {
  const { adapter } = await identity.$context
  const now = new Date()
  const identifier = apiResource(publicUrl)
  // Creates a row unless one exists, whoever created it first.
  const ensure = async (
    model: string,
    where: { field: string; value: string }[],
    data: Record<string, unknown>,
  ) => {
    if ((await adapter.findOne({ model, where })) === null) {
      await adapter.create({ model, data }).catch(async (error: unknown) => {
        if ((await adapter.findOne({ model, where })) === null) {
          throw error
        }
      })
    }
  }
  await ensure('oauthResource', [{ field: 'identifier', value: identifier }], {
    identifier,
    name: 'Polly API',
    accessTokenTtl: API_TOKEN_SECONDS,
    policyVersion: 1,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  })
  const byId = [{ field: 'clientId', value: MCP_CLIENT_ID }]
  const client = {
    clientSecret: await hashSecret(secret),
    name: 'Polly MCP server',
    tokenEndpointAuthMethod: 'client_secret_post',
    grantTypes: [TOKEN_EXCHANGE_GRANT],
    redirectUris: [],
    skipConsent: true,
    disabled: false,
    updatedAt: now,
  }
  await ensure('oauthClient', byId, { clientId: MCP_CLIENT_ID, createdAt: now, ...client })
  await adapter.update({ model: 'oauthClient', where: byId, update: client })
  await ensure('oauthClientResource', [...byId, { field: 'resourceId', value: identifier }], {
    clientId: MCP_CLIENT_ID,
    resourceId: identifier,
    createdAt: now,
  })
}
