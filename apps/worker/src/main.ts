// The worker's composition root: runs the analyses the API enqueues, as DBOS
// workflows on the worktree's database, with the analyzer its mode names: the
// fake one by default, the compute service's in real mode. A workflow
// interrupted by the worker's death resumes when a worker starts again.

import { DBOS } from '@dbos-inc/dbos-sdk'
import { computeAnalyzer, computeFingerprint, fakeAnalyzer } from '@polly/analysis'
import { type Analyzer, runPlaceholderAnalysis } from '@polly/back'
import { connect, waitForSchemaCurrent } from '@polly/database'
import { createLogger } from '@polly/logging'
import { environment, type Logger, Refusal, readConfigOf, type Settings } from '@polly/platform'
import { PLACEHOLDER_ANALYSIS } from '@polly/queue'

export interface WorkerOptions {
  databaseUrl: string
  analyzer: Analyzer
  log: Logger
}

export async function startWorker({
  databaseUrl,
  analyzer,
  log,
}: WorkerOptions): Promise<{ close: () => Promise<void> }> {
  const entry = (level: 'debug' | 'info' | 'warn' | 'error') => (value: unknown) =>
    typeof value === 'string' ? log[level](value) : log[level]('dbos', { value })
  DBOS.setConfig({
    name: 'polly',
    systemDatabaseUrl: databaseUrl,
    applicationVersion: PLACEHOLDER_ANALYSIS.applicationVersion,
    logger: { debug: entry('debug'), info: entry('info'), warn: entry('warn'), error: entry('error') },
  })
  DBOS.registerWorkflow((recordingId: string) => runPlaceholderAnalysis({ analyzer }, recordingId), {
    name: PLACEHOLDER_ANALYSIS.workflowName,
  })
  await DBOS.launch()
  // A queue persists its configuration in the system database: after launch.
  await DBOS.registerQueue(PLACEHOLDER_ANALYSIS.queueName)
  log.info('worker ready', { queue: PLACEHOLDER_ANALYSIS.queueName })
  return { close: () => DBOS.shutdown() }
}

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
  log: Logger,
  fetch: Fetch,
): Promise<void> {
  const baseUrl = config.POLLY_COMPUTE_URL ?? ''
  const worktree = config.POLLY_COMPUTE_FINGERPRINT ?? 'unversioned'
  try {
    const service = await computeFingerprint({ baseUrl, fetch })
    if (service !== worktree) {
      log.warn('COMPUTE_VERSION_MISMATCH', { worktree, service })
    }
  } catch (error) {
    log.warn('the compute service did not report its version', { url: baseUrl, error })
  }
}

if (process.argv[1] === import.meta.filename) {
  const log = createLogger({ name: 'polly-worker' })
  try {
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
      await checkComputeVersion(config, log, globalThis.fetch)
    }
    // The workflows read Polly's tables: nothing runs before they exist.
    const db = connect(config.DATABASE_URL)
    await waitForSchemaCurrent(db, { retryMs: 2000, onBehind: (message) => log.warn(message) })
    await db.destroy()
    await startWorker({ databaseUrl: config.DATABASE_URL, analyzer: chosen.analyzer, log })
  } catch (error) {
    if (error instanceof Refusal) {
      log.error(error.code, { reason: error.message })
    } else {
      log.error('the worker stopped', { error })
    }
    process.exit(1)
  }
}
