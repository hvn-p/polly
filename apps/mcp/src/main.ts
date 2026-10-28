// The MCP server's composition root. Run as a process, it serves POST /mcp on
// $POLLY_MCP_HOST:$POLLY_MCP_PORT, stateless, behind the front end's dev server
// locally. Each request's bearer token is exchanged for an API token; a token
// that does not exchange gets the 401 whose WWW-Authenticate header points the
// client at the OAuth flow.

import { isIP } from 'node:net'
import { serve } from '@hono/node-server'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { createApiClient } from '@polly/contract'
import { createLogger } from '@polly/logging'
import { type Logger, readConfigOf } from '@polly/platform'
import { exchangeToken } from './exchange.ts'
import { notFound, unauthorized } from './refusals.ts'
import { TOOLS, type ToolDefinition } from './tools.ts'

export interface McpOptions {
  hostname: string
  port: number
  // The worktree's origin: the resources and the metadata the challenge names.
  publicUrl: string
  // The API's own address, never through the public origin.
  apiUrl: string
  clientSecret: string
  log: Logger
  tools?: readonly ToolDefinition[]
}

export interface RunningMcp {
  url: string
  close: () => Promise<void>
}

export async function startMcpServer(options: McpOptions): Promise<RunningMcp> {
  const tools = options.tools ?? TOOLS
  const exchange = {
    apiUrl: options.apiUrl,
    apiResource: `${options.publicUrl}/api`,
    clientSecret: options.clientSecret,
  }
  const handler = createMcpHandler(
    ({ authInfo }) => {
      const server = new McpServer({ name: 'polly', version: '0.0.0' })
      const token = String(authInfo?.token)
      const api = createApiClient({ baseUrl: options.apiUrl, token: async () => token })
      for (const tool of tools) {
        tool(server, api)
      }
      return server
    },
    // Serves the 2026-07-28 revision and, statelessly, clients still on the
    // 2025 protocol.
    { legacy: 'stateless' },
  )
  const requests = options.log.child({ module: 'http' })
  const fetch = async (request: Request): Promise<Response> => {
    const started = performance.now()
    const response = await answer(request)
    requests.info('request', {
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      ms: Math.round(performance.now() - started),
    })
    return response
  }
  const answer = async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)
    if (pathname !== '/mcp') {
      return notFound(pathname)
    }
    const bearer = request.headers.get('authorization') ?? ''
    const apiToken = bearer.startsWith('Bearer ') ? await exchangeToken(exchange, bearer.slice(7)) : undefined
    if (apiToken === undefined) {
      return unauthorized(options.publicUrl)
    }
    return handler.fetch(request, { authInfo: { token: apiToken, clientId: '', scopes: [] } })
  }
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const listening = serve({ fetch, hostname: options.hostname, port: options.port }, () =>
      resolve(listening),
    )
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : options.port
  return {
    url: `http://${options.hostname.includes(':') ? `[${options.hostname}]` : options.hostname}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

if (process.argv[1] === import.meta.filename) {
  const log = createLogger({ name: 'polly-mcp' })
  const env = process.env
  const hostname = env['POLLY_MCP_HOST'] ?? ''
  const port = Number(env['POLLY_MCP_PORT'])
  const apiPort = Number(env['POLLY_API_PORT'])
  const invalid = [
    ...(isIP(hostname) === 0 ? ['POLLY_MCP_HOST'] : []),
    ...(Number.isInteger(port) && port > 0 ? [] : ['POLLY_MCP_PORT']),
    ...(isIP(env['POLLY_API_HOST'] ?? '') === 0 ? ['POLLY_API_HOST'] : []),
    ...(Number.isInteger(apiPort) && apiPort > 0 ? [] : ['POLLY_API_PORT']),
  ]
  if (invalid.length > 0) {
    log.error('INVALID_CONFIGURATION', { keys: invalid })
    process.exit(1)
  }
  try {
    const config = readConfigOf(env, ['PUBLIC_URL', 'MCP_CLIENT_SECRET'])
    const apiHost = env['POLLY_API_HOST'] === '0.0.0.0' ? '127.0.0.1' : String(env['POLLY_API_HOST'])
    const server = await startMcpServer({
      hostname,
      port,
      publicUrl: config.PUBLIC_URL,
      apiUrl: `http://${apiHost}:${apiPort}`,
      clientSecret: config.MCP_CLIENT_SECRET,
      log,
    })
    log.info('MCP server listening', { url: server.url })
  } catch (error) {
    log.error('the MCP server stopped', { error })
    process.exit(1)
  }
}
