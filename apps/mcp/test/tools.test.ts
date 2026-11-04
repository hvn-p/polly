import { randomBytes } from 'node:crypto'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { createLearner, mcpAccessToken } from '@polly/api/test-support'
import { describe, expect, it } from 'vitest'
import { mcpClient, resultOf } from './support/mcp.ts'
import { mcpTestServer } from './support/server.ts'
import { assertEveryToolCalled, recordCalls } from './support/tool-coverage.ts'

const server = await mcpTestServer()

describe('MCP tools', () => {
  it('C36: every tool the server lists is called by an MCP client, against the running server', async () => {
    const { email, password, learnerId } = await createLearner(server)
    const client = recordCalls(await mcpClient(server, await mcpAccessToken(server, email, password)))
    expect(resultOf(await client.callTool({ name: 'whoami', arguments: {} }))).toEqual({
      learnerId,
      name: 'learner',
    })
    const code = randomBytes(32).toString('base64url')
    expect(resultOf(await client.callTool({ name: 'start_lesson', arguments: { code } }))).toEqual({
      bound: true,
    })
    await expect(assertEveryToolCalled(client)).resolves.toBeUndefined()
  })
})

describe('tool coverage guard', () => {
  it('C37: fails with UNTESTED_MCP_TOOL, naming a tool no test calls', async () => {
    const fixture = new McpServer({ name: 'fixture', version: '0.0.0' })
    for (const name of ['called', 'forgotten']) {
      fixture.registerTool(name, { description: name }, async () => ({
        content: [{ type: 'text', text: name }],
      }))
    }
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await fixture.connect(serverSide)
    const client = recordCalls(new Client({ name: 'guard-test', version: '0.0.0' }))
    await client.connect(clientSide)
    await client.callTool({ name: 'called', arguments: {} })
    await expect(assertEveryToolCalled(client)).rejects.toThrow(/^UNTESTED_MCP_TOOL: forgotten$/)
    await client.close()
  })
})
