// The worker itself: the DBOS workflows on the worktree's database, run with
// the analyzer it is given. Apart from main.ts, so a test can start it with
// another analyzer without running the composition root.

import { DBOS, type DLogger } from '@dbos-inc/dbos-sdk'
import { type Analyzer, runPlaceholderAnalysis } from '@polly/back'
import type { WithTrace } from '@polly/platform'

export interface WorkerOptions {
  databaseUrl: string
  analyzer: Analyzer
  // The task it runs, as the queue's capacity names it; handed by the
  // composition root, the only one that imports that capacity.
  task: { queueName: string; workflowName: string; applicationVersion: string }
  // Runs each workflow inside a trace of its own: the logging capacity's.
  trace: WithTrace
  // Where DBOS writes its own log: the queue capacity's.
  logger: DLogger
}

// Resolves with the queue it listens to, once it does.
export async function startWorker({
  databaseUrl,
  analyzer,
  task,
  trace,
  logger,
}: WorkerOptions): Promise<{ queue: string }> {
  DBOS.setConfig({
    name: 'polly',
    systemDatabaseUrl: databaseUrl,
    applicationVersion: task.applicationVersion,
    logger,
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
