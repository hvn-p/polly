import { setTimeout as sleep } from 'node:timers/promises'

// Waits for a condition a process brings about asynchronously.
export async function until(condition: () => boolean | Promise<boolean>, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error('condition not met in time')
    }
    await sleep(50)
  }
}
