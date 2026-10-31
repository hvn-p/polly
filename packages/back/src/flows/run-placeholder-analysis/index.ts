// Runs the placeholder analysis of a recording, in the worker.

import { type AnalysisResult, type Analyzer, analyzeRecording } from '../../domains/analysis/index.ts'

export function runPlaceholderAnalysis(
  { analyzer }: { analyzer: Analyzer },
  recordingId: string,
): Promise<AnalysisResult> {
  return analyzeRecording(analyzer, recordingId)
}
