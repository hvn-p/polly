import { describe, expect, it } from 'vitest'
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
