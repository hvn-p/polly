// RFC 8693 token exchange: the MCP server trades the learner's MCP token for a
// token naming the API as its audience, for the same learner, valid 5 minutes
// (the API resource's lifetime). The client authenticates as the confidential
// client it is; the subject token must be an active token issued for the MCP.

import { createHash } from 'node:crypto'
import type { OAuthExtensionGrantHandler, OAuthProviderExtension } from '@better-auth/oauth-provider'
import { APIError } from 'better-auth/api'

export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange'
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'

function invalid(error: string, description: string): APIError {
  return new APIError('BAD_REQUEST', { error, error_description: description })
}

function exchange({ mcp, api }: { mcp: string; api: string }): OAuthExtensionGrantHandler {
  return async ({ ctx, provider }) => {
    const body = (ctx.body ?? {}) as Record<string, unknown>
    if (typeof body['subject_token'] !== 'string' || body['subject_token_type'] !== ACCESS_TOKEN_TYPE) {
      throw invalid('invalid_request', 'subject_token and an access_token subject_token_type are required')
    }
    const requested = body['resource'] ?? body['audience']
    if (requested !== undefined && requested !== api) {
      throw invalid('invalid_target', 'only the API may be requested')
    }
    const { client } = await provider.authenticateClient({ requireCredentials: true })
    const token = body['subject_token']
    const subject = await Promise.resolve()
      .then(() => provider.validateAccessToken(token))
      .catch(() => undefined)
    const audiences = [subject?.aud].flat()
    if (subject?.['active'] !== true || !audiences.includes(mcp) || typeof subject.sub !== 'string') {
      throw invalid('invalid_grant', 'the subject token is not an active token for the MCP')
    }
    const user = await ctx.context.internalAdapter.findUserById(subject.sub)
    if (user === null) {
      throw invalid('invalid_grant', 'the subject token names no learner')
    }
    // The API token carries the subject token's scopes, never more.
    const scopes = String(subject['scope'] ?? '')
      .split(' ')
      .filter((scope) => scope !== '')
    return provider.issueTokens({ client, user, scopes, resources: [api] })
  }
}

// How a client secret is kept: its SHA-256, the same for the clients Better Auth
// registers and the one registerMcpClient records.
export async function hashSecret(secret: string): Promise<string> {
  return createHash('sha256').update(secret).digest('base64url')
}

// The MCP server's client id. Its secret is the worktree's, or the vault's in
// production; registerMcpClient records both at the API's start.
export const MCP_CLIENT_ID = 'polly-mcp'

export function tokenExchange(resources: { mcp: string; api: string }): OAuthProviderExtension {
  return { grants: { [TOKEN_EXCHANGE_GRANT]: exchange(resources) } }
}
