// The durable-task capacity: a task enqueued through DBOS for the worker that
// runs it, its result read through its handle. The task's definition (queue,
// workflow, version, input and result schemas) comes from its contract.

import type { DBOSClient } from '@dbos-inc/dbos-sdk'
import type { AnalysisQueue } from '@polly/back'

// What validates a value crossing the queue: a schema's parse.
interface Parser<T> {
  parse: (value: unknown) => T
}

export interface TaskDefinition<Input, Result> {
  queueName: string
  workflowName: string
  // Set explicitly on both sides, so a task enqueued here is run by the worker
  // whatever their code hashes are.
  applicationVersion: string
  input: Parser<Input>
  result: Parser<Result>
}

export function dbosAnalysisQueue<Result>(
  client: DBOSClient,
  task: TaskDefinition<{ recordingId: string }, Result>,
): AnalysisQueue<Result> {
  return {
    analyze: async (recordingId) => {
      const handle = await client.enqueuePortable(
        { queueName: task.queueName, workflowName: task.workflowName, appVersion: task.applicationVersion },
        [task.input.parse({ recordingId })],
      )
      return task.result.parse(await handle.getResult())
    },
  }
}
