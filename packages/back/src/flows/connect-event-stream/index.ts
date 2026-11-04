// An event listener's connection: admitted with its code, then served once the
// code is bound to a learner.

import {
  admit,
  bindingOfAdmitted,
  type CodeState,
  type EventCodeStore,
} from '../../domains/event-codes/index.ts'

export function connectEventStream({ codes }: { codes: EventCodeStore }, code: string): Promise<string> {
  return admit(codes, code)
}

// The binding the connection waits for; a code revoked meanwhile is refused.
export function bindingOf(
  { codes }: { codes: EventCodeStore },
  codeHash: string,
): Promise<Exclude<CodeState, { state: 'revoked' }>> {
  return bindingOfAdmitted(codes, codeHash)
}
