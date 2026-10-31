import { describe, expect, it } from 'vitest'
import type { EventCodeStore } from '../../domains/event-codes/index.ts'
import { startLesson } from './index.ts'

describe('start lesson', () => {
  it('binds the code to the learner', async () => {
    const saved: [string, string][] = []
    const store: EventCodeStore = {
      insertIfAbsent: async (codeHash, learnerId) => {
        saved.push([codeHash, learnerId])
      },
      find: async () => ({ learnerId: 'learner-a', revoked: false }),
    }
    expect(await startLesson({ codes: store }, 'learner-a', 'b'.repeat(43))).toEqual({ bound: true })
    expect(saved).toHaveLength(1)
  })
})
