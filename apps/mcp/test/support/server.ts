import { captureLog, type TestServer, testServer } from '@polly/api/test-support'
import { afterAll } from 'vitest'
import { type RunningMcp, startMcpServer } from '../../src/main.ts'

export interface McpTestServer extends TestServer {
  // The MCP server in front of this API, as an agent reaches it.
  mcpUrl: string
  // The MCP server's registered routes, for the route walk.
  mcpRoutes: RunningMcp['routes']
}

// The API in process against the test database, with the MCP server in
// process in front of it, both closed after the test file.
export async function mcpTestServer(...options: Parameters<typeof testServer>): Promise<McpTestServer> {
  const api = await testServer(...options)
  const mcp = await startMcpServer({
    hostname: '127.0.0.1',
    port: 0,
    publicUrl: api.config.PUBLIC_URL,
    apiUrl: api.url,
    clientSecret: api.config.MCP_CLIENT_SECRET,
    log: captureLog().log,
  })
  afterAll(async () => {
    await mcp.close()
  })
  return { ...api, mcpUrl: `${mcp.url}/mcp`, mcpRoutes: mcp.routes }
}
