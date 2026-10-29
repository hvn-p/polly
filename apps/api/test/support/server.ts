import { connect } from '@polly/database'
import { createIdentity, type Identity } from '@polly/identity'
import { startMcpServer } from '@polly/mcp'
import type { Config } from '@polly/platform'
import { afterAll } from 'vitest'
import { type RunningServer, type ServerOptions, startServer } from '../../src/main.ts'
import { testConfig } from './config.ts'
import { captureLog } from './log.ts'

// Tests never reach the network: a client metadata document is never fetched.
export const noClientMetadataFetch = async (): Promise<never> => {
  throw new Error('no network in tests')
}

export interface TestServer extends RunningServer {
  config: Config
  // The same identity the server uses, for server-side set-up in tests.
  identity: Identity
  // The MCP server in front of this API, as an agent reaches it.
  mcpUrl: string
}

// The API in process, on an ephemeral port of loopback unless the test names
// another address, against the test database, with the MCP server in process in
// front of it. Both closed after the test file.
export async function testServer(
  overrides: Partial<Config> = {},
  options: Partial<Pick<ServerOptions, 'clock' | 'hostname' | 'log'>> = {},
): Promise<TestServer> {
  const config = testConfig(overrides)
  const server = await startServer({
    config,
    hostname: '127.0.0.1',
    port: 0,
    fetchClientMetadataResource: noClientMetadataFetch,
    log: captureLog().log,
    ...options,
  })
  const db = connect(config.DATABASE_URL)
  const identity = createIdentity({
    publicUrl: config.PUBLIC_URL,
    secret: config.BETTER_AUTH_SECRET,
    db,
    fetchClientMetadataResource: noClientMetadataFetch,
  })
  const mcp = await startMcpServer({
    hostname: '127.0.0.1',
    port: 0,
    publicUrl: config.PUBLIC_URL,
    apiUrl: server.url,
    clientSecret: config.MCP_CLIENT_SECRET,
    log: captureLog().log,
  })
  afterAll(async () => {
    await mcp.close()
    await server.close()
    await db.destroy()
  })
  return { ...server, config, identity, mcpUrl: `${mcp.url}/mcp` }
}
