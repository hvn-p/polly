import { describe, expect, it } from 'vitest'
import type { AnalysisResult } from '../../domains/analysis/index.ts'
import { runPlaceholderAnalysis } from './index.ts'

describe('running the placeholder analysis', () => {
  it('hands the recording to the analyzer and returns its result', async () => {
    const result: AnalysisResult = { recordingId: 'rec-1', score: 0.5, analyzer: 'model', modelLoaded: true }
    const analyzer = { analyze: async (recordingId: string) => ({ ...result, recordingId }) }
    expect(await runPlaceholderAnalysis({ analyzer }, 'rec-1')).toEqual(result)
  })
})
