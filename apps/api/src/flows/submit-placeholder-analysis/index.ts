// Submits a recording to the placeholder analysis and waits for its result.
// The analysis runs in the worker, never in the request; the queue is a port
// the flow owns and the entry tier feeds. The real analysis replaces it.

export interface AnalysisQueue<Result> {
  // Enqueues the analysis of a recording and resolves with its result.
  analyze: (recordingId: string) => Promise<Result>
}

export function submitPlaceholderAnalysis<Result>(
  queue: AnalysisQueue<Result>,
  recordingId: string,
): Promise<Result> {
  return queue.analyze(recordingId)
}
