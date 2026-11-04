import { describe, expect, it } from 'vitest'
import { describeLearner } from './index.ts'

const directory = {
  nameOf: async (learnerId: string) => (learnerId === 'learner-1' ? 'Ada' : undefined),
}

describe('describing the learner a request names', () => {
  it('gives their identifier and their name', async () => {
    expect(await describeLearner({ directory }, 'learner-1')).toEqual({ learnerId: 'learner-1', name: 'Ada' })
  })

  it('refuses UNAUTHORIZED a learner whose account is gone', async () => {
    await expect(describeLearner({ directory }, 'learner-2')).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
