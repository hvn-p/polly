import { describe, expect, it } from 'vitest'
import { systemClock } from './index.ts'

describe('the system clock', () => {
  it('reads the time and waits', async () => {
    const before = systemClock.now()
    await systemClock.sleep(5)
    expect(systemClock.now() - before).toBeGreaterThanOrEqual(4)
  })
})
