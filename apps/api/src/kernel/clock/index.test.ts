import { describe, expect, it } from 'vitest'
import { systemClock } from './index.ts'

describe('system clock', () => {
  it('reads the time and sleeps for the given time', async () => {
    const before = systemClock.now()
    await systemClock.sleep(20)
    expect(systemClock.now() - before).toBeGreaterThanOrEqual(15)
  })
})
