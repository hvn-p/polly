import { describe, expect, it } from 'vitest'
import { computeAnalyzer, computeFingerprint, fakeAnalyzer } from './index.ts'

describe('the fake analyzer', () => {
  it('C29: returns its predefined result for the recording, loading no model', async () => {
    expect(await fakeAnalyzer.analyze('rec-1')).toEqual({
      recordingId: 'rec-1',
      score: 0.75,
      analyzer: 'fake',
      modelLoaded: false,
    })
  })
})

describe('the compute analyzer', () => {
  it('fails naming the status when the service refuses the analysis', async () => {
    const fetch = async () => new Response('{"detail":[]}', { status: 422 })
    await expect(computeAnalyzer({ baseUrl: 'http://127.0.0.1:1', fetch }).analyze('rec-1')).rejects.toThrow(
      'COMPUTE_FAILED: POST /analyses answered 422',
    )
  })
})

describe("the compute service's version", () => {
  it('is the fingerprint the service reports', async () => {
    const fetch = async () => Response.json({ fingerprint: '0123456789ab' })
    expect(await computeFingerprint({ baseUrl: 'http://127.0.0.1:1', fetch })).toBe('0123456789ab')
  })

  it('fails naming the status when the service does not answer it', async () => {
    const fetch = async () => new Response('', { status: 502 })
    await expect(computeFingerprint({ baseUrl: 'http://127.0.0.1:1', fetch })).rejects.toThrow(
      'COMPUTE_FAILED: GET /version answered 502',
    )
  })
})
