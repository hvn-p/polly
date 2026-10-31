// The worker itself: the DBOS workflows on the worktree's database, run with
// the analyzer it is given. Apart from main.ts, so a test can start it with
// another analyzer without running the composition root.

import { DBOS } from '@dbos-inc/dbos-sdk'
import { type Analyzer, runPlaceholderAnalysis } from '@polly/back'
import type { LogEvent, WithTrace } from '@polly/platform'
import { log } from '@polly/platform/log'
import { DBOS_DEBUG, DBOS_ERROR, DBOS_INFO, DBOS_WARNING } from './events.ts'

export interface WorkerOptions {
  databaseUrl: string
  analyzer: Analyzer
  // The task it runs, as the queue's capacity names it; handed by the
  // composition root, the only one that imports that capacity.
  task: { queueName: string; workflowName: string; applicationVersion: string }
  // Runs each workflow inside a trace of its own: the logging capacity's.
  trace: WithTrace
}

// Resolves with the queue it listens to, once it does.
export async function startWorker({
  databaseUrl,
  analyzer,
  task,
  trace,
}: WorkerOptions): Promise<{ queue: string }> {
  const entry = (event: LogEvent) => (message: unknown) => log(event, { message })
  DBOS.setConfig({
    name: 'polly',
    systemDatabaseUrl: databaseUrl,
    applicationVersion: task.applicationVersion,
    logger: {
      debug: entry(DBOS_DEBUG),
      info: entry(DBOS_INFO),
      warn: entry(DBOS_WARNING),
      error: entry(DBOS_ERROR),
    },
  })
  DBOS.registerWorkflow(
    (recordingId: string) => trace(undefined, () => runPlaceholderAnalysis({ analyzer }, recordingId)),
    {
      name: task.workflowName,
    },
  )
  await DBOS.launch()
  // A queue persists its configuration in the system database: after launch.
  await DBOS.registerQueue(task.queueName)
  return { queue: task.queueName }
}
