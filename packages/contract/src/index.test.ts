import { describe, expect, it } from 'vitest'
import { createApiClient } from './index.ts'

function recordingFetch(answer: Response) {
  const calls: Request[] = []
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input, init))
    return answer.clone()
  }
  return { calls, fetch }
}

describe('API client', () => {
  it('calls an operation with the bearer token and its JSON body, and reads its value', async () => {
    const { calls, fetch } = recordingFetch(Response.json({ bound: true }))
    const api = createApiClient({ baseUrl: 'http://127.0.0.1:1', token: async () => 'api-token', fetch })
    expect(await api.call('bindEventCode', { code: 'c'.repeat(43) })).toEqual({
      ok: true,
      value: { bound: true },
    })
    const [request] = calls
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe('http://127.0.0.1:1/api/event-codes')
    expect(request?.headers.get('authorization')).toBe('Bearer api-token')
    expect(await request?.json()).toEqual({ code: 'c'.repeat(43) })
  })

  it('sends no body for an operation that takes none', async () => {
    const { calls, fetch } = recordingFetch(Response.json({ learnerId: 'l-1', name: 'Ada' }))
    const api = createApiClient({ baseUrl: 'http://127.0.0.1:1', token: async () => 't', fetch })
    expect(await api.call('getMe')).toEqual({ ok: true, value: { learnerId: 'l-1', name: 'Ada' } })
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.body).toBeNull()
  })

  it('reads a success whose value breaks its schema as UNEXPECTED, never as the value', async () => {
    for (const malformed of [{ learnerId: 42 }, {}, { learnerId: 'l'.repeat(65) }]) {
      const { fetch } = recordingFetch(Response.json(malformed))
      const api = createApiClient({ baseUrl: 'http://x', token: async () => 't', fetch })
      expect(await api.call('getMe')).toEqual({
        ok: false,
        status: 200,
        code: 'UNEXPECTED',
        reason: 'the answer does not match the contract',
      })
    }
  })

  it('sends no authorization header without a token, as a browser relying on its cookie', async () => {
    const { calls, fetch } = recordingFetch(Response.json({ learnerId: 'l-1', name: 'Ada' }))
    await createApiClient({ baseUrl: 'http://x', fetch }).call('getMe')
    expect(calls[0]?.headers.has('authorization')).toBe(false)
  })

  it('reads a refusal by its code, and an answer outside the contract as UNEXPECTED', async () => {
    const refused = recordingFetch(
      Response.json({ code: 'EVENT_CODE_REVOKED', reason: 'draw a new one' }, { status: 403 }),
    )
    const api = createApiClient({ baseUrl: 'http://x', token: async () => 't', fetch: refused.fetch })
    expect(await api.call('bindEventCode', { code: 'c' })).toEqual({
      ok: false,
      status: 403,
      code: 'EVENT_CODE_REVOKED',
      reason: 'draw a new one',
    })
    const odd = recordingFetch(new Response('boom', { status: 502 }))
    const other = createApiClient({ baseUrl: 'http://x', token: async () => 't', fetch: odd.fetch })
    expect(await other.call('getMe')).toEqual({ ok: false, status: 502, code: 'UNEXPECTED' })
  })
})
