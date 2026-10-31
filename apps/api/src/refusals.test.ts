import { Refusal } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { operations } from './contracts/api.ts'
import {
  answer,
  challengeResponse,
  eventFrame,
  keepaliveFrame,
  notFoundResponse,
  refusalFrame,
  refusalResponse,
  streamResponse,
} from './refusals.ts'

// The statuses contracts/http-and-mcp.md gives each refusal code.
const STATUS_OF_CODE = {
  UNAUTHORIZED: 401,
  INVALID_EMAIL_OR_PASSWORD: 401,
  INVALID_OAUTH_REQUEST: 400,
  INVALID_EVENT_CODE: 400,
  EVENT_CODE_REVOKED: 403,
  EVENT_CODE_NOT_BOUND: 409,
  EVENT_CODE_ALREADY_BOUND: 409,
}

describe('refusal translation', () => {
  it('turns each refusal code into an HTTP response carrying its code and reason, with its status', async () => {
    for (const [code, status] of Object.entries(STATUS_OF_CODE)) {
      const response = refusalResponse(new Refusal(code, 'why'))
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ code, reason: 'why' })
    }
  })

  it('refuses to answer a code the contract does not list', () => {
    expect(() => refusalResponse(new Refusal('NOT_LOCAL_ENVIRONMENT', 'why'))).toThrow(
      'NOT_LOCAL_ENVIRONMENT is no refusal of the contract',
    )
  })

  it('answers an unauthenticated request UNAUTHORIZED, with the challenge that starts the OAuth flow', async () => {
    const response = challengeResponse('Bearer resource_metadata="https://x/.well-known"')
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://x/.well-known"')
    expect(await response.json()).toEqual({ code: 'UNAUTHORIZED', reason: 'sign in to Polly through OAuth' })
  })

  it('answers a path no route serves with 404 and no body', async () => {
    const response = notFoundResponse()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })
})

describe('answer translation', () => {
  it("answers each operation with its value, as JSON, with the contract's success status", async () => {
    // A fixture whose status is not 200, so an answer written with a fixed one fails.
    for (const operation of [
      operations.signIn,
      operations.consent,
      operations.getMe,
      operations.bindEventCode,
      { status: 202 },
    ]) {
      const response = answer(operation, { done: true })
      expect(response.status).toBe(operation.status)
      expect(response.headers.get('content-type')).toMatch(/^application\/json/)
      expect(await response.json()).toEqual({ done: true })
    }
  })

  it('sets each cookie the answer carries', () => {
    const response = answer(operations.signIn, {}, ['a=1; Secure', 'b=2; Secure'])
    expect(response.headers.getSetCookie()).toEqual(['a=1; Secure', 'b=2; Secure'])
  })

  it("answers a stream as an event stream, with the contract's success status", async () => {
    const empty = () => new ReadableStream({ start: (c) => c.close() })
    expect(streamResponse(operations.agentEvents, empty()).status).toBe(operations.agentEvents.status)
    expect(streamResponse({ status: 203 }, empty()).status).toBe(203)
    const response = streamResponse(operations.agentEvents, empty())
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })

  it('writes an event, a keepalive, and the refusal that ends a stream as event-stream frames', () => {
    expect(eventFrame({ type: 'test' })).toBe('event: test\ndata: {"type":"test"}\n\n')
    expect(keepaliveFrame()).toBe(': keepalive\n\n')
    expect(
      refusalFrame(operations.agentEvents, new Refusal('EVENT_CODE_NOT_BOUND', 'bind it with start_lesson')),
    ).toBe('event: error\ndata: {"code":"EVENT_CODE_NOT_BOUND","reason":"bind it with start_lesson"}\n\n')
  })

  it('refuses to end a stream with a refusal its contract does not list', () => {
    expect(() => refusalFrame(operations.agentEvents, new Refusal('INVALID_EVENT_CODE', 'why'))).toThrow(
      'INVALID_EVENT_CODE does not end this stream',
    )
  })
})
