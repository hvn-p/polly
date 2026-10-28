// Connects a lesson's event stream to the learner: binds the code the agent's
// event listener drew.

import { bind, type EventCodeStore } from '../../domains/event-codes/index.ts'

export async function startLesson(
  { codes }: { codes: EventCodeStore },
  learnerId: string,
  code: string,
): Promise<{ bound: true }> {
  await bind(codes, learnerId, code)
  return { bound: true }
}
