import { fakeAnalyzer } from '@polly/analysis'
import { describe, expect, it } from 'vitest'
import { analyzerFor, checkComputeVersion } from './main.ts'

const local = { POLLY_ENV: 'local' } as const

// Answers the compute service's operations, recording each URL called.
function computeService(answers: Record<string, unknown>) {
  const urls: string[] = []
  const fetch = async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    return Response.json(answers[new URL(url).pathname])
  }
  return { urls, fetch }
}

const refusing = async (): Promise<Response> => {
  throw new TypeError('fetch failed')
}

describe("the worker's analyzer", () => {
  it('C29: is the fake one by default, locally', () => {
    expect(analyzerFor(local, refusing)).toEqual({ analyzer: fakeAnalyzer })
    expect(analyzerFor({ ...local, POLLY_WORKER_MODE: 'fake' }, refusing)).toEqual({ analyzer: fakeAnalyzer })
  })

  it('is never the fake one outside a local worktree, whether named or by default', () => {
    expect(analyzerFor({ POLLY_ENV: 'production' }, refusing)).toEqual({ invalid: 'POLLY_WORKER_MODE' })
    expect(analyzerFor({ POLLY_ENV: 'production', POLLY_WORKER_MODE: 'fake' }, refusing)).toEqual({
      invalid: 'POLLY_WORKER_MODE',
    })
  })

  it("calls the compute service in real mode, at the worktree's compute URL", async () => {
    const service = computeService({ '/analyses': { recordingId: 'r1', score: 0.5, modelLoaded: true } })
    const real = analyzerFor(
      { ...local, POLLY_WORKER_MODE: 'real', POLLY_COMPUTE_URL: 'http://127.0.0.1:8000' },
      service.fetch,
    )
    if (!('analyzer' in real)) {
      throw new Error('no analyzer')
    }
    expect(await real.analyzer.analyze('r1')).toEqual({
      recordingId: 'r1',
      score: 0.5,
      modelLoaded: true,
      analyzer: 'model',
    })
    expect(service.urls).toEqual(['http://127.0.0.1:8000/analyses'])
  })

  it('names the compute URL missing in real mode', () => {
    expect(analyzerFor({ ...local, POLLY_WORKER_MODE: 'real' }, refusing)).toEqual({
      invalid: 'POLLY_COMPUTE_URL',
    })
  })
})

describe("the compute service's version", () => {
  function recordingLog() {
    const lines: unknown[][] = []
    const log = {
      debug: () => undefined,
      info: () => undefined,
      warn: (...line: unknown[]) => lines.push(line),
      error: () => undefined,
      child: () => log,
    }
    return { lines, log }
  }

  it('is reported as unknown, without stopping the worker, when the service does not answer', async () => {
    const { lines, log } = recordingLog()
    await checkComputeVersion({ POLLY_COMPUTE_URL: 'http://127.0.0.1:8000' }, log, refusing)
    expect(lines).toEqual([
      [
        'the compute service did not report its version',
        expect.objectContaining({ url: 'http://127.0.0.1:8000' }),
      ],
    ])
  })

  it("warns COMPUTE_VERSION_MISMATCH naming both when the service's differs from the worktree's", async () => {
    const { lines, log } = recordingLog()
    const service = computeService({ '/version': { fingerprint: 'fp-other' } })
    await checkComputeVersion(
      { POLLY_COMPUTE_URL: 'http://127.0.0.1:8000', POLLY_COMPUTE_FINGERPRINT: 'fp-main' },
      log,
      service.fetch,
    )
    expect(service.urls).toEqual(['http://127.0.0.1:8000/version'])
    expect(lines).toEqual([['COMPUTE_VERSION_MISMATCH', { worktree: 'fp-main', service: 'fp-other' }]])
  })
})
