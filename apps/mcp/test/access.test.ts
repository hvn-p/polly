import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { captureLog } from '@polly/api/test-support'
import { describe, expect, it } from 'vitest'
import { startMcpServer } from '../src/main.ts'
import { mcpTestServer } from './support/server.ts'

const server = await mcpTestServer({ POLLY_ENV: 'local' })

describe("the MCP server's route walk", () => {
  it('C23: registers its routes with an access rule, /mcp for a learner', () => {
    expect(server.mcpRoutes.map(({ method, path, access }) => ({ method, path, access }))).toEqual([
      { method: 'ALL', path: '/mcp', access: 'learner' },
    ])
  })

  it('C23: every learner route refuses an anonymous request, or a foreign token, with 401 and the OAuth metadata', async () => {
    for (const { path } of server.mcpRoutes.filter(({ access }) => access === 'learner')) {
      for (const authorization of [undefined, 'Bearer not-a-token']) {
        const response = await fetch(new URL(path, server.mcpUrl), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...(authorization === undefined ? {} : { authorization }),
          },
          body: '{}',
        })
        expect({ path, status: response.status }).toEqual({ path, status: 401 })
        expect(response.headers.get('www-authenticate')).toMatch(/^Bearer .*resource_metadata=/)
      }
    }
  })
})

describe("the MCP server's token exchange", () => {
  it('answers an identity outage as an unexpected failure, not with the OAuth challenge', async () => {
    const identity = createServer((_request, response) => {
      response.writeHead(503).end('down')
    })
    await new Promise<void>((resolve) => identity.listen(0, '127.0.0.1', resolve))
    const down = `http://127.0.0.1:${(identity.address() as AddressInfo).port}`
    const mcp = await startMcpServer({
      hostname: '127.0.0.1',
      port: 0,
      publicUrl: 'https://outage.polly.localhost',
      apiUrl: down,
      clientSecret: 's'.repeat(43),
      log: captureLog().log,
    })
    try {
      const response = await fetch(`${mcp.url}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: 'Bearer mcp-token',
        },
        body: '{}',
      })
      expect(response.status).toBe(500)
      expect(response.headers.has('www-authenticate')).toBe(false)
    } finally {
      await mcp.close()
      await new Promise((resolve) => identity.close(resolve))
    }
  })
})
