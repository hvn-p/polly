// The durable-task capacity: a task enqueued through DBOS for the worker that
// runs it, its result read through its handle.

import type { DBOSClient, DLogger } from '@dbos-inc/dbos-sdk'
import type { AnalysisQueue, AnalysisResult } from '@polly/back'
import type { LogEvent } from '@polly/platform'
import { log } from '@polly/platform/log'
import { DBOS_DEBUG, DBOS_ERROR, DBOS_INFO, DBOS_WARNING } from './events.ts'

// Where the placeholder analysis runs: the API enqueues it there, the worker
// registers its workflow there.
export const PLACEHOLDER_ANALYSIS = {
  queueName: 'pron-analysis',
  workflowName: 'placeholder_analysis',
  // Set explicitly on both sides, so a task enqueued here is run by the worker
  // whatever their code hashes are.
  applicationVersion: 'polly-skeleton-1',
} as const

export function dbosAnalysisQueue(client: DBOSClient): AnalysisQueue {
  return {
    analyze: async (recordingId) => {
      const handle = await client.enqueue<(recordingId: string) => Promise<AnalysisResult>>(
        {
          queueName: PLACEHOLDER_ANALYSIS.queueName,
          workflowName: PLACEHOLDER_ANALYSIS.workflowName,
          appVersion: PLACEHOLDER_ANALYSIS.applicationVersion,
        },
        recordingId,
      )
      return handle.getResult()
    },
  }
}

// DBOS's own log, written as the queue's events at the level DBOS gives.
export function dbosLogger(): DLogger {
  const entry = (event: LogEvent) => (message: unknown) => log(event, { message })
  return {
    debug: entry(DBOS_DEBUG),
    info: entry(DBOS_INFO),
    warn: entry(DBOS_WARNING),
    error: entry(DBOS_ERROR),
  }
}
