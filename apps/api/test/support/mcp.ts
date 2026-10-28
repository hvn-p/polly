import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterAll } from 'vitest'
import type { TestServer } from './server.ts'

// An MCP client over HTTP, as an agent connects, with the given access token.
export async function mcpClient(server: TestServer, token: string): Promise<Client> {
  const client = new Client({ name: 'polly-tests', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(server.mcpUrl), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  afterAll(async () => {
    await client.close()
  })
  return client
}

// The text of a tool result: its structured content when it has one.
export function resultOf(result: unknown): unknown {
  const { structuredContent, content, isError } = result as {
    structuredContent?: unknown
    content?: { type: string; text?: string }[]
    isError?: boolean
  }
  return isError === true ? { error: content?.[0]?.text } : structuredContent
}
