import { describe, expect, it } from 'vitest'
import { mcpClient, resultOf } from './support/mcp.ts'
import { createLearner, mcpAccessToken } from './support/oauth.ts'
import { type TestServer, testServer } from './support/server.ts'

// The whole of 127.0.0.0/8 is loopback on Linux: a server listening on
// 127.0.0.1 alone does not answer on 127.0.0.2.
const everyInterface = await testServer({}, { hostname: '0.0.0.0' })
const otherAddress = await testServer({}, { hostname: '127.0.0.2' })

async function whoamiAnswers(server: TestServer): Promise<void> {
  const { email, password, learnerId } = await createLearner(server)
  const client = await mcpClient(server, await mcpAccessToken(server, email, password))
  expect(resultOf(await client.callTool({ name: 'whoami', arguments: {} }))).toEqual({ learnerId })
}

describe('the listen address', () => {
  it('listens on every interface, as in a container the platform reaches by name', async () => {
    const port = new URL(everyInterface.url).port
    const metadata = await fetch(`http://127.0.0.2:${port}/.well-known/oauth-protected-resource/mcp`)
    expect(metadata.status).toBe(200)
    await whoamiAnswers(everyInterface)
  })

  it('reads its own key set on the address it listens on to verify MCP tokens', async () => {
    expect(new URL(otherAddress.url).hostname).toBe('127.0.0.2')
    await whoamiAnswers(otherAddress)
  })
})
