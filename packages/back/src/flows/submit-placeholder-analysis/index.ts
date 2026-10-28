// Submits a recording to the placeholder analysis and waits for its result.

import { type AnalysisQueue, requestAnalysis } from '../../domains/analysis/index.ts'

export function submitPlaceholderAnalysis<Result>(
  { queue }: { queue: AnalysisQueue<Result> },
  recordingId: string,
): Promise<Result> {
  return requestAnalysis(queue, recordingId)
}
