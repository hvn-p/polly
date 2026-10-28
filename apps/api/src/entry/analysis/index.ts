// The analysis queue over DBOS: the placeholder task is enqueued as a portable
// workflow the Python worker runs, and its result is read through its handle.

import type { DBOSClient } from '@dbos-inc/dbos-sdk'
import type { AnalysisQueue } from '@polly/back'
import type { z } from 'zod'
import {
  placeholderAnalysisInput,
  placeholderAnalysisResult,
  placeholderAnalysisTask,
} from '../contracts/placeholder-analysis.ts'

const { queueName, workflowName, applicationVersion } = placeholderAnalysisTask.shape

export function dbosAnalysisQueue(
  client: DBOSClient,
): AnalysisQueue<z.infer<typeof placeholderAnalysisResult>> {
  return {
    analyze: async (recordingId) => {
      const input = placeholderAnalysisInput.parse({ recordingId })
      const handle = await client.enqueuePortable(
        {
          queueName: queueName.value,
          workflowName: workflowName.value,
          appVersion: applicationVersion.value,
        },
        [input],
      )
      return placeholderAnalysisResult.parse(await handle.getResult())
    },
  }
}
