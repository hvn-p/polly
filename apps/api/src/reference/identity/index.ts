// The identity of a learner: Better Auth, which is also the OAuth 2.1
// authorization server of the MCP. Polly's code reaches it only through the
// options built here and the instance they create.

import { cimd } from '@better-auth/cimd'
import { mcp } from '@better-auth/mcp'
import { type BetterAuthOptions, betterAuth } from 'better-auth'
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

export function identityOptions(settings: IdentitySettings) {
  return {
    baseURL: settings.publicUrl,
    secret: settings.secret,
    database: { db: settings.db, type: 'postgres' },
    emailAndPassword: { enabled: true, disableSignUp: true },
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
