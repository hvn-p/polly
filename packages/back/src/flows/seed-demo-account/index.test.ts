import { describe, expect, it } from 'vitest'
import type { LearnerAccount } from '../../domains/accounts/index.ts'
import { DEMO_ACCOUNT, seedDemoAccount } from './index.ts'

function accounts() {
  const created: LearnerAccount[] = []
  return {
    created,
    port: {
      create: async (account: LearnerAccount) => {
        created.push(account)
        return 'learner-1'
      },
    },
  }
}

describe('demo account seed', () => {
  it('C26: refuses outside the local environment, and creates no account', async () => {
    const { created, port } = accounts()
    await expect(seedDemoAccount({ accounts: port, environment: 'production' })).rejects.toMatchObject({
      code: 'NOT_LOCAL_ENVIRONMENT',
    })
    expect(created).toEqual([])
  })

  it('creates the demo account locally', async () => {
    const { created, port } = accounts()
    expect(await seedDemoAccount({ accounts: port, environment: 'local' })).toBe('learner-1')
    expect(created).toEqual([DEMO_ACCOUNT])
  })
})
