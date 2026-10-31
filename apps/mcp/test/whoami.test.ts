import { createLearner, mcpAccessToken, strictRefusal } from '@polly/api/test-support'
import { describe, expect, it } from 'vitest'
import { mcpClient, resultOf } from './support/mcp.ts'
import { mcpTestServer } from './support/server.ts'

const server = await mcpTestServer()

describe('MCP endpoint and whoami', () => {
  it('C45: whoami without a token is refused with 401 and the protected resource metadata', async () => {
    const response = await fetch(server.mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'whoami', arguments: {} },
      }),
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="${server.config.PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`,
    )
    expect(strictRefusal.parse(await response.json()).code).toBe('UNAUTHORIZED')
  })

  it('whoami returns the learner the token was issued to', async () => {
    const { learnerId, email, password } = await createLearner(server)
    const client = await mcpClient(server, await mcpAccessToken(server, email, password))
    expect(resultOf(await client.callTool({ name: 'whoami', arguments: {} }))).toEqual({
      learnerId,
      name: 'learner',
    })
  })

  it('admits each request as its own learner, request after request', async () => {
    const first = await createLearner(server, 'first')
    const second = await createLearner(server, 'second')
    const firstClient = await mcpClient(server, await mcpAccessToken(server, first.email, first.password))
    const secondClient = await mcpClient(server, await mcpAccessToken(server, second.email, second.password))
    expect(resultOf(await secondClient.callTool({ name: 'whoami', arguments: {} }))).toEqual({
      learnerId: second.learnerId,
      name: 'second',
    })
    expect(resultOf(await firstClient.callTool({ name: 'whoami', arguments: {} }))).toEqual({
      learnerId: first.learnerId,
      name: 'first',
    })
  })

  it('describes whoami as the contract writes it', async () => {
    const { email, password } = await createLearner(server)
    const client = await mcpClient(server, await mcpAccessToken(server, email, password))
    const { tools } = await client.listTools()
    expect(tools.find(({ name }) => name === 'whoami')?.description).toBe(
      'Returns the identifier and the name of the learner this connection is signed in as. Call it to check that Polly is reachable and that you are signed in.',
    )
  })
})

describe('tokens of another worktree', async () => {
  const other = await mcpTestServer({
    PUBLIC_URL: 'https://other.polly.localhost',
    BETTER_AUTH_SECRET: 'another-secret-'.padEnd(43, 'y'),
  })

  it('C24: a token issued by worktree A is refused by worktree B', async () => {
    const { email, password } = await createLearner(server)
    const token = await mcpAccessToken(server, email, password)
    const response = await fetch(other.mcpUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(response.status).toBe(401)
  })
})
