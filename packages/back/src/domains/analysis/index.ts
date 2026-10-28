// Recording analysis. It runs in the worker, never in a request: the queue is
// the port through which it is asked for. The real analysis replaces the
// placeholder.

export interface AnalysisQueue<Result> {
  // Enqueues the analysis of a recording and resolves with its result.
  analyze: (recordingId: string) => Promise<Result>
}

export function requestAnalysis<Result>(queue: AnalysisQueue<Result>, recordingId: string): Promise<Result> {
  return queue.analyze(recordingId)
}
