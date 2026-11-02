import { type LogRecord, plugLogSink } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { checkComputeVersion, computeAnalyzer, computeFingerprint, fakeAnalyzer } from './index.ts'

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

  it('fails when the service answers a result its contract does not describe', async () => {
    const fetch = async () => Response.json({ recordingId: 'rec-1', score: 'high', modelLoaded: true })
    await expect(computeAnalyzer({ baseUrl: 'http://127.0.0.1:1', fetch }).analyze('rec-1')).rejects.toThrow(
      'COMPUTE_FAILED: POST /analyses answered outside its contract',
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

describe("checking the compute service's version against the worktree's", () => {
  function capture(): LogRecord[] {
    const records: LogRecord[] = []
    plugLogSink({ write: (record) => records.push(record) })
    return records
  }
  const read = (records: LogRecord[]) =>
    records.map(({ event, fields }) => ({ event: event.name, level: event.level, fields }))

  it('is reported as unknown, without stopping the worker, when the service does not answer', async () => {
    const records = capture()
    const fetch = async (): Promise<Response> => {
      throw new TypeError('fetch failed')
    }
    await checkComputeVersion({ baseUrl: 'http://127.0.0.1:8000', fetch }, undefined)
    expect(read(records)).toEqual([
      {
        event: 'analysis.compute_version.unknown',
        level: 'warn',
        fields: { url: 'http://127.0.0.1:8000', error: new TypeError('fetch failed') },
      },
    ])
  })

  it("warns of a version mismatch naming both when the service's differs from the worktree's", async () => {
    const records = capture()
    const urls: string[] = []
    const fetch = async (input: string | URL | Request) => {
      urls.push(String(input))
      return Response.json({ fingerprint: 'fp-other' })
    }
    await checkComputeVersion({ baseUrl: 'http://127.0.0.1:8000', fetch }, 'fp-main')
    expect(urls).toEqual(['http://127.0.0.1:8000/version'])
    expect(read(records)).toEqual([
      {
        event: 'analysis.compute_version.mismatched',
        level: 'warn',
        fields: { worktree: 'fp-main', service: 'fp-other' },
      },
    ])
  })

  it('says nothing when both run the same version, and counts an unversioned worktree as one', async () => {
    const records = capture()
    const answering = (fingerprint: string) => async () => Response.json({ fingerprint })
    await checkComputeVersion({ baseUrl: 'http://127.0.0.1:8000', fetch: answering('fp-main') }, 'fp-main')
    await checkComputeVersion(
      { baseUrl: 'http://127.0.0.1:8000', fetch: answering('unversioned') },
      undefined,
    )
    expect(records).toEqual([])
  })
})
