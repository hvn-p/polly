import { Refusal } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { notFound, refusedRequest, toolResult, unauthorized } from './refusals.ts'

// The statuses contracts/http-and-mcp.md gives each refusal code: the API's.
const STATUS_OF_CODE = {
  UNAUTHORIZED: 401,
  INVALID_EMAIL_OR_PASSWORD: 401,
  INVALID_OAUTH_REQUEST: 400,
  INVALID_EVENT_CODE: 400,
  EVENT_CODE_REVOKED: 403,
  EVENT_CODE_NOT_BOUND: 409,
  EVENT_CODE_ALREADY_BOUND: 409,
}

describe("the MCP server's refusals", () => {
  it('passes an API refusal to the agent as `CODE: reason`', () => {
    expect(
      toolResult({ ok: false, status: 403, code: 'EVENT_CODE_REVOKED', reason: 'this code was revoked' }),
    ).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'EVENT_CODE_REVOKED: this code was revoked' }],
    })
  })

  it('passes a refusal without a reason as its code alone', () => {
    expect(toolResult({ ok: false, status: 401, code: 'UNAUTHORIZED' })).toMatchObject({
      content: [{ type: 'text', text: 'UNAUTHORIZED' }],
    })
  })

  it('passes a success as its value, in text and structured', () => {
    expect(toolResult({ ok: true, value: { learnerId: 'l1' } })).toEqual({
      content: [{ type: 'text', text: '{"learnerId":"l1"}' }],
      structuredContent: { learnerId: 'l1' },
    })
  })

  it('points a client without a token at the OAuth metadata', async () => {
    const response = unauthorized('https://x.polly.localhost')
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://x.polly.localhost/.well-known/oauth-protected-resource/mcp"',
    )
    expect(await response.json()).toEqual({ code: 'UNAUTHORIZED', reason: 'sign in to Polly through OAuth' })
  })

  it('answers a refusal an access rule or a route throws with its code, its reason, and the status the contract gives it', async () => {
    for (const [code, status] of Object.entries(STATUS_OF_CODE)) {
      const response = refusedRequest(new Refusal(code, 'why'))
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ code, reason: 'why' })
    }
  })

  it('refuses to answer a code the contract does not list', () => {
    expect(() => refusedRequest(new Refusal('INVALID_CONFIGURATION', 'why'))).toThrow(
      'INVALID_CONFIGURATION is no refusal of the contract',
    )
  })

  it('answers a path it does not serve with 404 and no code outside the contract', async () => {
    const response = notFound()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })
})
