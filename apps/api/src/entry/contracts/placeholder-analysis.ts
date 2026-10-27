// The contract of the placeholder analysis task between the API and the
// worker: where the task runs (queue, workflow, application version), its
// input and its result. The worker reads the JSON Schema and the Python types
// generated from it (nr contracts). The real analysis replaces it.

import { z } from 'zod'

export const placeholderAnalysisTask = z.object({
  queueName: z.literal('pron-analysis'),
  workflowName: z.literal('placeholder_analysis'),
  // Both sides set it explicitly, so a workflow enqueued by the API is run by
  // the worker whatever their code hashes are.
  applicationVersion: z.literal('polly-skeleton-1'),
})

export const placeholderAnalysisInput = z.object({
  recordingId: z.string().min(1).max(64),
})

export const placeholderAnalysisResult = z.object({
  recordingId: z.string().min(1).max(64),
  score: z.number().min(0).max(1),
  analyzer: z.enum(['fake', 'model']),
  modelLoaded: z.boolean(),
})

export const schemas = {
  PlaceholderAnalysisTask: placeholderAnalysisTask,
  PlaceholderAnalysisInput: placeholderAnalysisInput,
  PlaceholderAnalysisResult: placeholderAnalysisResult,
}
