// The MCP endpoint: POST /mcp behind the learner access rule, Streamable HTTP,
// stateless. Each request gets a server whose tools act for the learner the
// token was issued to. The tools know no particular client.

import { type CallToolResult, createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { Refusal } from '@polly/platform'
import type { z } from 'zod'
import { toolRefusal } from '../refusals.ts'
import type { RouteRegistry } from '../routes.ts'

export interface ToolContext {
  learnerId: string
}

// A tool registers itself on the server of one request.
export type ToolDefinition = (server: McpServer, context: ToolContext) => void

// A tool: its name and description, read by the agent before it acts, its
// input and output schemas, and what it does for the learner. It refuses by
// throwing a Refusal, which reaches the agent as a tool error.
export function defineTool<Input extends z.ZodObject, Output extends z.ZodObject>(tool: {
  name: string
  description: string
  inputSchema: Input
  outputSchema: Output
  handle: (input: z.infer<Input>, context: ToolContext) => Promise<z.infer<Output>>
}): ToolDefinition {
  // Registered as any object schema: the server's callback type cannot be
  // resolved for a schema left generic. The handler gets its input typed by
  // parsing it with its own schema.
  const inputSchema: z.ZodObject = tool.inputSchema
  const outputSchema: z.ZodObject = tool.outputSchema
  return (server, context) => {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema, outputSchema },
      async (input): Promise<CallToolResult> => {
        try {
          // The server validated the input already; parsing types it.
          const output = await tool.handle(tool.inputSchema.parse(input), context)
          return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output }
        } catch (error) {
          if (error instanceof Refusal) {
            return toolRefusal(error)
          }
          throw error
        }
      },
    )
  }
}

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
