// The learner's MCP token, exchanged at the identity's token endpoint (RFC 8693)
// for a token naming the API as its audience, the MCP server authenticating as
// its confidential client. A token the identity does not accept exchanges to
// nothing.

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange'
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'
export const MCP_CLIENT_ID = 'polly-mcp'

export interface ExchangeSettings {
  // The API's address, on loopback or the platform's network.
  apiUrl: string
  // The API as a resource: the audience of the exchanged token.
  apiResource: string
  clientSecret: string
}

export async function exchangeToken(
  settings: ExchangeSettings,
  subjectToken: string,
): Promise<string | undefined> {
  const response = await fetch(new URL('/api/auth/oauth2/token', settings.apiUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      client_id: MCP_CLIENT_ID,
      client_secret: settings.clientSecret,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      resource: settings.apiResource,
    }),
  })
  if (!response.ok) {
    return undefined
  }
  const { access_token: token } = (await response.json()) as { access_token?: unknown }
  return typeof token === 'string' ? token : undefined
}
