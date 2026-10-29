// The worker's composition root: runs the analyses the API enqueues, as DBOS
// workflows on the worktree's database, with the analyzer its mode names: the
// fake one by default, the compute service's in real mode. A workflow
// interrupted by the worker's death resumes when a worker starts again.

import { DBOS } from '@dbos-inc/dbos-sdk'
import { computeAnalyzer, fakeAnalyzer } from '@polly/analysis'
import { type Analyzer, runPlaceholderAnalysis } from '@polly/back'
import { createLogger } from '@polly/logging'
import { type Logger, readConfigOf } from '@polly/platform'
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

// The analyzer of the worktree's POLLY_WORKER_MODE, or the setting that
// prevents it.
export function analyzerFor(
  env: Record<string, string | undefined>,
): { analyzer: Analyzer } | { invalid: string } {
  const mode = env['POLLY_WORKER_MODE'] ?? 'fake'
  if (mode === 'fake') {
    return { analyzer: fakeAnalyzer }
  }
  if (mode !== 'real') {
    return { invalid: 'POLLY_WORKER_MODE' }
  }
  const computeUrl = env['POLLY_COMPUTE_URL'] ?? ''
  return URL.canParse(computeUrl)
    ? { analyzer: computeAnalyzer({ baseUrl: computeUrl }) }
    : { invalid: 'POLLY_COMPUTE_URL' }
}

if (process.argv[1] === import.meta.filename) {
  const log = createLogger({ name: 'polly-worker' })
  const chosen = analyzerFor(process.env)
  if ('invalid' in chosen) {
    log.error('INVALID_CONFIGURATION', { keys: [chosen.invalid] })
    process.exit(1)
  }
  try {
    const config = readConfigOf(process.env, ['DATABASE_URL'])
    await startWorker({ databaseUrl: config.DATABASE_URL, analyzer: chosen.analyzer, log })
  } catch (error) {
    log.error('the worker stopped', { error })
    process.exit(1)
  }
}
