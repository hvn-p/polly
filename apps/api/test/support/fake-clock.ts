import type { Clock } from '../../src/kernel/clock/index.ts'

// A clock whose time moves only when the test advances it.
export function fakeClock() {
  let now = 0
  const sleepers: { at: number; wake: () => void }[] = []
  const clock: Clock & { advance: (ms: number) => Promise<void> } = {
    now: () => now,
    sleep: (ms) => new Promise<void>((wake) => sleepers.push({ at: now + ms, wake })),
    advance: async (ms) => {
      const target = now + ms
      // One step per due sleeper, letting each woken loop schedule its next.
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        const due = sleepers.filter(({ at }) => at <= target).sort((a, b) => a.at - b.at)[0]
        if (due === undefined) {
          break
        }
        sleepers.splice(sleepers.indexOf(due), 1)
        now = due.at
        due.wake()
      }
      now = target
      await new Promise((resolve) => setTimeout(resolve, 5))
    },
  }
  return clock
}
