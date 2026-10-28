import { describe, expect, it } from 'vitest'
import { submitPlaceholderAnalysis } from './index.ts'

describe('placeholder analysis', () => {
  it('hands the recording to the queue and returns its result', async () => {
    const queue = { analyze: async (recordingId: string) => ({ recordingId, score: 1 }) }
    expect(await submitPlaceholderAnalysis({ queue }, 'rec-1')).toEqual({ recordingId: 'rec-1', score: 1 })
  })
})
