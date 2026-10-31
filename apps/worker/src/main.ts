// The worker's composition root: runs the analyses the API enqueues, as DBOS
// workflows on the worktree's database, with the analyzer its mode names: the
// fake one by default, the compute service's in real mode. A workflow
// interrupted by the worker's death resumes when a worker starts again.

import { computeAnalyzer, computeFingerprint, fakeAnalyzer } from '@polly/analysis'
import type { Analyzer } from '@polly/back'
import { waitForSchema } from '@polly/database'
import { runProcess, withTrace } from '@polly/logging'
import { environment, Refusal, readConfigOf, type Settings } from '@polly/platform'
import { log } from '@polly/platform/log'
import { PLACEHOLDER_ANALYSIS } from '@polly/queue'
import { COMPUTE_VERSION_MISMATCHED, COMPUTE_VERSION_UNKNOWN } from './events.ts'
import { startWorker } from './worker.ts'

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

// The analyzer POLLY_WORKER_MODE names, or the setting that prevents it. The
// fake analyzer is a local worktree's only: outside one, the mode is required
// and real.
export function analyzerFor(
  config: Pick<Settings, 'POLLY_ENV' | 'POLLY_WORKER_MODE' | 'POLLY_COMPUTE_URL'>,
  fetch: Fetch,
): { analyzer: Analyzer } | { invalid: string } {
  const mode = config.POLLY_WORKER_MODE ?? (config.POLLY_ENV === 'local' ? 'fake' : undefined)
  if (mode === 'fake' && config.POLLY_ENV === 'local') {
    return { analyzer: fakeAnalyzer }
  }
  if (mode !== 'real') {
    return { invalid: 'POLLY_WORKER_MODE' }
  }
  return config.POLLY_COMPUTE_URL === undefined
    ? { invalid: 'POLLY_COMPUTE_URL' }
    : { analyzer: computeAnalyzer({ baseUrl: config.POLLY_COMPUTE_URL, fetch }) }
}

// Warns when the compute service runs another version of the code than the
// worktree's services/compute: comparing two versions is legitimate, testing
// one without knowing is not.
export async function checkComputeVersion(
  config: Pick<Settings, 'POLLY_COMPUTE_URL' | 'POLLY_COMPUTE_FINGERPRINT'>,
  fetch: Fetch,
): Promise<void> {
  const baseUrl = config.POLLY_COMPUTE_URL ?? ''
  const worktree = config.POLLY_COMPUTE_FINGERPRINT ?? 'unversioned'
  try {
    const service = await computeFingerprint({ baseUrl, fetch })
    if (service !== worktree) {
      log(COMPUTE_VERSION_MISMATCHED, { worktree, service })
    }
  } catch (error) {
    log(COMPUTE_VERSION_UNKNOWN, { url: baseUrl, error })
  }
}

if (process.argv[1] === import.meta.filename) {
  await runProcess({
    name: 'polly-worker',
    start: async () => {
      const config = readConfigOf(environment(), [
        'DATABASE_URL',
        'POLLY_ENV',
        'POLLY_WORKER_MODE',
        'POLLY_COMPUTE_URL',
        'POLLY_COMPUTE_FINGERPRINT',
      ])
      const chosen = analyzerFor(config, globalThis.fetch)
      if ('invalid' in chosen) {
        throw new Refusal('INVALID_CONFIGURATION', `${chosen.invalid} invalid or missing`)
      }
      if (config.POLLY_WORKER_MODE === 'real') {
        await checkComputeVersion(config, globalThis.fetch)
      }
      // The workflows read Polly's tables: nothing runs before they exist.
      await waitForSchema(config.DATABASE_URL, { retryMs: 2000 })
      return startWorker({
        databaseUrl: config.DATABASE_URL,
        analyzer: chosen.analyzer,
        task: PLACEHOLDER_ANALYSIS,
        trace: withTrace,
      })
    },
  })
}
