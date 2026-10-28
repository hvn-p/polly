// An event listener's connection: admitted with its code, then served once the
// code is bound to a learner.

import { admit, type CodeState, type EventCodeStore, stateOf } from '../../domains/event-codes/index.ts'

export function connectEventStream({ codes }: { codes: EventCodeStore }, code: string): Promise<string> {
  return admit(codes, code)
}

export function bindingOf({ codes }: { codes: EventCodeStore }, codeHash: string): Promise<CodeState> {
  return stateOf(codes, codeHash)
}
