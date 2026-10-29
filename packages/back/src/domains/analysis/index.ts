// Recording analysis. It runs in the worker, never in a request: the queue is
// the port through which it is asked for, the analyzer the port that computes
// it. The real analysis replaces the placeholder.

export interface AnalysisResult {
  recordingId: string
  score: number
  analyzer: 'fake' | 'model'
  modelLoaded: boolean
}

export interface AnalysisQueue {
  // Enqueues the analysis of a recording and resolves with its result.
  analyze: (recordingId: string) => Promise<AnalysisResult>
}

export interface Analyzer {
  // Analyzes one recording.
  analyze: (recordingId: string) => Promise<AnalysisResult>
}

export function requestAnalysis(queue: AnalysisQueue, recordingId: string): Promise<AnalysisResult> {
  return queue.analyze(recordingId)
}

export function analyzeRecording(analyzer: Analyzer, recordingId: string): Promise<AnalysisResult> {
  return analyzer.analyze(recordingId)
}
