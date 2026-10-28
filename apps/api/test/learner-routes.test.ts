import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { operations } from '../src/entry/contracts/api.ts'
import { createLearner, exchangeToken, mcpAccessToken } from './support/oauth.ts'
import { testServer } from './support/server.ts'

const server = await testServer()

async function tokens() {
  const { learnerId, email, password } = await createLearner(server)
  const mcpToken = await mcpAccessToken(server, email, password)
  const { access_token: apiToken } = (await (
    await exchangeToken(server, { subjectToken: mcpToken })
  ).json()) as {
    access_token: string
  }
  return { learnerId, mcpToken, apiToken }
}

function bind(token: string, body: unknown): Promise<Response> {
  return fetch(`${server.url}/api/event-codes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('the learner routes of the contract', () => {
  it('registers every operation of the contract, with its method, path and access rule', () => {
    for (const operation of Object.values(operations)) {
      expect(server.routes).toContainEqual(
        expect.objectContaining({ method: operation.method, path: operation.path, access: operation.access }),
      )
    }
  })

  it('GET /api/me names the learner the API token was issued to', async () => {
    const { learnerId, apiToken } = await tokens()
    const response = await fetch(`${server.url}/api/me`, { headers: { authorization: `Bearer ${apiToken}` } })
    expect(await response.json()).toEqual({ learnerId })
  })

  it('C72: the MCP token sent to the API as is is refused with 401', async () => {
    const { mcpToken } = await tokens()
    expect(
      (await fetch(`${server.url}/api/me`, { headers: { authorization: `Bearer ${mcpToken}` } })).status,
    ).toBe(401)
    expect((await bind(mcpToken, { code: randomBytes(32).toString('base64url') })).status).toBe(401)
  })

  it('POST /api/event-codes binds a code, and refuses a malformed one or a missing body by its code', async () => {
    const { apiToken } = await tokens()
    expect(await (await bind(apiToken, { code: randomBytes(32).toString('base64url') })).json()).toEqual({
      bound: true,
    })
    for (const body of [{ code: 'short' }, {}, 'not an object']) {
      const response = await bind(apiToken, body)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID_EVENT_CODE' })
    }
  })
})
