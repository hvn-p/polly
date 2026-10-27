// The MCP endpoint: POST /mcp behind the learner access rule, Streamable HTTP,
// stateless. Each request gets a server whose tools act for the learner the
// token was issued to. The tools know no particular client.

import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import type { RouteRegistry } from '../routes.ts'

export interface ToolContext {
  learnerId: string
}

// A tool registers itself on the server of one request.
export type ToolDefinition = (server: McpServer, context: ToolContext) => void

export function registerMcpRoute(registry: RouteRegistry, tools: readonly ToolDefinition[]): void {
  const handler = createMcpHandler(
    ({ authInfo }) => {
      const server = new McpServer({ name: 'polly', version: '0.0.0' })
      const learnerId = String(authInfo?.extra?.['learnerId'])
      for (const tool of tools) {
        tool(server, { learnerId })
      }
      return server
    },
    // Serves the 2026-07-28 revision and, statelessly, clients still on the
    // 2025 protocol.
    { legacy: 'stateless' },
  )
  registry.add({
    method: 'POST',
    path: '/mcp',
    access: 'learner',
    handle: (request, { learnerId }) =>
      handler.fetch(request, { authInfo: { token: '', clientId: '', scopes: [], extra: { learnerId } } }),
  })
}
