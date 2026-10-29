import { describe, expect, it } from 'vitest'
import { submitPlaceholderAnalysis } from './index.ts'

describe('placeholder analysis', () => {
  it('hands the recording to the queue and returns its result', async () => {
    const result = { recordingId: 'rec-1', score: 1, analyzer: 'fake', modelLoaded: false } as const
    const queue = { analyze: async (recordingId: string) => ({ ...result, recordingId }) }
    expect(await submitPlaceholderAnalysis({ queue }, 'rec-1')).toEqual(result)
  })
})
