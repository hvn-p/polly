import { fakeAnalyzer } from '@polly/analysis'
import { describe, expect, it } from 'vitest'
import { analyzerFor } from './main.ts'

describe("the worker's analyzer", () => {
  it('C29: is the fake one by default', () => {
    expect(analyzerFor({})).toEqual({ analyzer: fakeAnalyzer })
    expect(analyzerFor({ POLLY_WORKER_MODE: 'fake' })).toEqual({ analyzer: fakeAnalyzer })
  })

  it("calls the compute service in real mode, at the worktree's compute URL", () => {
    const real = analyzerFor({ POLLY_WORKER_MODE: 'real', POLLY_COMPUTE_URL: 'http://127.0.0.1:8000' })
    expect(real).toEqual({ analyzer: { analyze: expect.any(Function) } })
    expect(real).not.toEqual({ analyzer: fakeAnalyzer })
  })

  it('names the setting that is missing or wrong', () => {
    expect(analyzerFor({ POLLY_WORKER_MODE: 'real' })).toEqual({ invalid: 'POLLY_COMPUTE_URL' })
    expect(analyzerFor({ POLLY_WORKER_MODE: 'real', POLLY_COMPUTE_URL: 'nowhere' })).toEqual({
      invalid: 'POLLY_COMPUTE_URL',
    })
    expect(analyzerFor({ POLLY_WORKER_MODE: 'slow' })).toEqual({ invalid: 'POLLY_WORKER_MODE' })
  })
})
