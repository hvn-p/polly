import { Refusal } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { notFound, refusedRequest, toolResult, unauthorized } from './refusals.ts'

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
    expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('answers a refusal an access rule or a route throws with its code and reason', async () => {
    const response = refusedRequest(new Refusal('EVENT_CODE_REVOKED', 'draw a new code'))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ code: 'EVENT_CODE_REVOKED', reason: 'draw a new code' })
  })

  it('answers a path it does not serve with 404 and no code outside the contract', async () => {
    const response = notFound()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })
})
