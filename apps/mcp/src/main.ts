// The MCP server's composition root. Run as a process, it serves POST /mcp on
// $POLLY_MCP_HOST:$POLLY_MCP_PORT, stateless, behind the front end's dev server
// locally. Each request's bearer token is exchanged for an API token; a token
// that does not exchange gets the 401 whose WWW-Authenticate header points the
// client at the OAuth flow.

import { serve } from '@hono/node-server'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { createApiClient } from '@polly/contract'
import { runProcess, traceparent, withTrace } from '@polly/logging'
import {
  environment,
  originOf,
  type Route,
  RouteRegistry,
  readConfigOf,
  type WithTrace,
} from '@polly/platform'
import { log } from '@polly/platform/log'
import { REQUEST_FAILED, REQUEST_SERVED } from './events.ts'
import { exchangeToken } from './exchange.ts'
import { notFound, refusedRequest, unauthorized, unexpected } from './refusals.ts'
import { TOOLS, type ToolDefinition } from './tools.ts'

export interface McpOptions {
  hostname: string
  port: number
  // The worktree's origin: the resources and the metadata the challenge names.
  publicUrl: string
  // The API's own address, never through the public origin.
  apiUrl: string
  clientSecret: string
  // Runs each request inside its trace, and gives the traceparent each call
  // to the API carries: the logging capacity's.
  trace: WithTrace
  traceparent: () => string | undefined
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
  // Every call to the API carries the request's trace.
  const fetch = (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers)
    const parent = options.traceparent()
    if (parent !== undefined) {
      headers.set('traceparent', parent)
    }
    return globalThis.fetch(input, { ...init, headers })
  }
  const exchange = {
    apiUrl: options.apiUrl,
    apiResource: `${options.publicUrl}/api`,
    clientSecret: options.clientSecret,
    fetch,
  }
  const handler = createMcpHandler(
    ({ authInfo }) => {
      const server = new McpServer({ name: 'polly', version: '0.0.0' })
      const token = String(authInfo?.token)
      const api = createApiClient({ baseUrl: options.apiUrl, token: async () => token, fetch })
      for (const tool of tools) {
        tool(server, api)
      }
      return server
    },
    // Serves the 2026-07-28 revision and, statelessly, clients still on the
    // 2025 protocol.
    { legacy: 'stateless' },
  )
  // Each request runs inside its trace and is logged once, with identifiers
  // only; an unexpected error is answered here and logged on that line, the
  // one place that handles it.
  const serveRequest = (request: Request): Promise<Response> =>
    options.trace(request.headers.get('traceparent'), async () => {
      const started = performance.now()
      const fields = { method: request.method, path: new URL(request.url).pathname }
      const ms = () => Math.round(performance.now() - started)
      try {
        const response = await answer(request)
        log(REQUEST_SERVED, { ...fields, status: response.status, ms: ms() })
        return response
      } catch (error) {
        const response = unexpected()
        log(REQUEST_FAILED, { ...fields, status: response.status, ms: ms(), error })
        return response
      }
    })
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
    const listening = serve({ fetch: serveRequest, hostname: options.hostname, port: options.port }, () =>
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
export function settingsFrom(
  env: Record<string, string | undefined>,
): Omit<McpOptions, 'trace' | 'traceparent' | 'tools'> {
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
  await runProcess({
    name: 'polly-mcp',
    start: async () => {
      const server = await startMcpServer({ ...settingsFrom(environment()), trace: withTrace, traceparent })
      return { url: server.url }
    },
  })
}
