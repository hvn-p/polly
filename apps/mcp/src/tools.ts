// The MCP tools. Each acts for the learner through the API's client, with the
// token the request exchanged; a refusal of the API reaches the agent as a
// tool error starting with its code. The tools know no particular client.

import type { McpServer } from '@modelcontextprotocol/server'
import type { ApiClient, Outcome } from '@polly/contract'
import { z } from 'zod'
import { toolResult } from './refusals.ts'

// A tool registers itself on the server of one request.
export type ToolDefinition = (server: McpServer, api: ApiClient) => void

function defineTool<Input extends z.ZodObject, Output extends z.ZodObject>(tool: {
  name: string
  description: string
  inputSchema: Input
  outputSchema: Output
  call: (input: z.infer<Input>, api: ApiClient) => Promise<Outcome<z.infer<Output>>>
}): ToolDefinition {
  // Registered as any object schema: the server's callback type cannot be
  // resolved for a schema left generic. The call gets its input typed by
  // parsing it with its own schema.
  const inputSchema: z.ZodObject = tool.inputSchema
  const outputSchema: z.ZodObject = tool.outputSchema
  return (server, api) => {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema, outputSchema },
      async (input) => toolResult(await tool.call(tool.inputSchema.parse(input), api)),
    )
  }
}

export const whoami = defineTool({
  name: 'whoami',
  description:
    'Returns the identifier of the learner this connection is signed in as. Call it to check that Polly is reachable and that you are signed in.',
  inputSchema: z.object({}),
  outputSchema: z.object({ learnerId: z.string() }),
  call: (_input, api) => api.call('getMe'),
})

export const startLesson = defineTool({
  name: 'start_lesson',
  description:
    "Connects the lesson's event stream to the signed-in learner. Call it with the event code your Polly event listener gave you, each time it gives a new one. The code is a secret: do not repeat it to the user.",
  // Bounded here, checked exactly by the API, so a malformed code gets its
  // named refusal.
  inputSchema: z.object({ code: z.string().max(256) }),
  outputSchema: z.object({ bound: z.literal(true) }),
  call: ({ code }, api) => api.call('bindEventCode', { code }),
})

export const TOOLS: readonly ToolDefinition[] = [whoami, startLesson]
