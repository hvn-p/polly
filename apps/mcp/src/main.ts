// The MCP server's composition root. Run as a process, it serves POST /mcp on
// $POLLY_MCP_HOST:$POLLY_MCP_PORT, stateless, behind the front end's dev server
// locally. Each request's bearer token is exchanged for an API token; a token
// that does not exchange gets the 401 whose WWW-Authenticate header points the
// client at the OAuth flow.

import { serve } from '@hono/node-server'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { createApiClient } from '@polly/contract'
import { createLogger } from '@polly/logging'
import {
  environment,
  type Logger,
  originOf,
  Refusal,
  type Route,
  RouteRegistry,
  readConfigOf,
} from '@polly/platform'
import { exchangeToken } from './exchange.ts'
import { notFound, refusedRequest, unauthorized } from './refusals.ts'
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

// What the server's access rules establish about a request they let through.
export interface AccessContext {
  // The learner's API token, exchanged for the request's MCP token.
  learner: { apiToken: string }
}

export interface RunningMcp {
  url: string
  // The registered routes, for the route walk.
  routes: readonly Route<AccessContext>[]
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
  const registry = new RouteRegistry<AccessContext>(
    {
      // A token that does not exchange gets the challenge of the OAuth flow.
      learner: async (request) => {
        const bearer = request.headers.get('authorization') ?? ''
        const apiToken = bearer.startsWith('Bearer ')
          ? await exchangeToken(exchange, bearer.slice('Bearer '.length))
          : undefined
        return apiToken === undefined ? unauthorized(options.publicUrl) : { apiToken }
      },
    },
    refusedRequest,
  ).add({
    method: 'ALL',
    path: '/mcp',
    access: 'learner',
    handle: (request, { apiToken }) =>
      handler.fetch(request, { authInfo: { token: apiToken, clientId: '', scopes: [] } }),
  })
  const answer = async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)
    const route = registry
      .routes()
      .find(({ method, path }) => path === pathname && (method === 'ALL' || method === request.method))
    return route === undefined ? notFound() : registry.handler(route)(request)
  }
  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const listening = serve({ fetch, hostname: options.hostname, port: options.port }, () =>
      resolve(listening),
    )
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : options.port
  return {
    url: originOf(options.hostname, port),
    routes: registry.routes(),
    close: () =>
      new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

// The server's settings, read from the environment: it reaches the API on the
// API's own address, never through the public origin.
export function settingsFrom(env: Record<string, string | undefined>): Omit<McpOptions, 'log' | 'tools'> {
  const config = readConfigOf(env, [
    'POLLY_MCP_HOST',
    'POLLY_MCP_PORT',
    'POLLY_API_HOST',
    'POLLY_API_PORT',
    'PUBLIC_URL',
    'MCP_CLIENT_SECRET',
  ])
  return {
    hostname: config.POLLY_MCP_HOST,
    port: config.POLLY_MCP_PORT,
    publicUrl: config.PUBLIC_URL,
    apiUrl: originOf(config.POLLY_API_HOST, config.POLLY_API_PORT),
    clientSecret: config.MCP_CLIENT_SECRET,
  }
}

if (process.argv[1] === import.meta.filename) {
  const log = createLogger({ name: 'polly-mcp' })
  try {
    const server = await startMcpServer({ ...settingsFrom(environment()), log })
    log.info('MCP server listening', { url: server.url })
  } catch (error) {
    if (error instanceof Refusal) {
      log.error(error.code, { reason: error.message })
    } else {
      log.error('the MCP server stopped', { error })
    }
    process.exit(1)
  }
}
