// The analysis queue over DBOS: the placeholder task is enqueued as a portable
// workflow the Python worker runs, and its result is read through its handle.

import type { DBOSClient } from '@dbos-inc/dbos-sdk'
import type { z } from 'zod'
import type { AnalysisQueue } from '../../flows/submit-placeholder-analysis/index.ts'
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
