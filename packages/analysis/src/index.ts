// The analyzer's adapters: the fake one, which a worktree's worker uses by
// default, and the compute service's, through the client generated from its
// OpenAPI.

import type { Analyzer } from '@polly/back'
import { z } from 'zod'
import { OPERATIONS, type Operations, RESPONSES } from './generated.ts'

// Returns a predefined result through the real path, and loads no model.
export const fakeAnalyzer: Analyzer = {
  analyze: async (recordingId) => ({ recordingId, score: 0.75, analyzer: 'fake', modelLoaded: false }),
}

interface ComputeService {
  baseUrl: string
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

// Each operation's response schema, built once.
const VALIDATORS = Object.fromEntries(
  Object.entries(RESPONSES).map(([name, schema]) => [name, z.fromJSONSchema(schema)]),
)

// Calls one operation of the compute service and reads its answer, checked
// against its schema.
async function call<N extends keyof Operations>(
  { baseUrl, fetch = globalThis.fetch }: ComputeService,
  name: N,
  body: Operations[N]['body'],
): Promise<Operations[N]['response']> {
  const { method, path } = OPERATIONS[name]
  const response = await fetch(new URL(path, baseUrl), {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    throw new Error(`COMPUTE_FAILED: ${method} ${path} answered ${response.status}`)
  }
  const answer: unknown = await response.json().catch(() => undefined)
  if (!(VALIDATORS[name]?.safeParse(answer).success ?? false)) {
    throw new Error(`COMPUTE_FAILED: ${method} ${path} answered outside its contract`)
  }
  return answer as Operations[N]['response']
}

export function computeAnalyzer(service: ComputeService): Analyzer {
  return {
    analyze: async (recordingId) => ({
      ...(await call(service, 'analyze', { recordingId })),
      analyzer: 'model',
    }),
  }
}

// The fingerprint of the sources the service's image was built from.
export async function computeFingerprint(service: ComputeService): Promise<string> {
  return (await call(service, 'version', undefined)).fingerprint
}
