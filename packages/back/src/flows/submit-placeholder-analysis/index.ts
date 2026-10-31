// Submits a recording to the placeholder analysis and waits for its result.

import { type AnalysisQueue, type AnalysisResult, requestAnalysis } from '../../domains/analysis/index.ts'

export function submitPlaceholderAnalysis(
  { queue }: { queue: AnalysisQueue },
  recordingId: string,
): Promise<AnalysisResult> {
  return requestAnalysis(queue, recordingId)
}
