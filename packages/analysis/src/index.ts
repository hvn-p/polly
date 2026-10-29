// The analyzer's adapters: the fake one, which a worktree's worker uses by
// default, and the compute service's, through the client generated from its
// OpenAPI.

import type { Analyzer } from '@polly/back'
import { OPERATIONS, type Operations } from './generated.ts'

// Returns a predefined result through the real path, and loads no model.
export const fakeAnalyzer: Analyzer = {
  analyze: async (recordingId) => ({ recordingId, score: 0.75, analyzer: 'fake', modelLoaded: false }),
}

export function computeAnalyzer({
  baseUrl,
  fetch = globalThis.fetch,
}: {
  baseUrl: string
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}): Analyzer {
  return {
    analyze: async (recordingId) => {
      const { method, path } = OPERATIONS.analyze
      const body: Operations['analyze']['body'] = { recordingId }
      const response = await fetch(new URL(path, baseUrl), {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error(`COMPUTE_FAILED: ${method} ${path} answered ${response.status}`)
      }
      const analysis = (await response.json()) as Operations['analyze']['response']
      return { ...analysis, analyzer: 'model' }
    },
  }
}
