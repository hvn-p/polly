// Event codes: a secret an event listener draws, bound once to a learner through
// start_lesson, active until revoked. Stored as its hash only, and never logged.

import { hash, isEventCode } from '@polly/kernel'
import { Refusal } from '@polly/platform'

// Where the codes are kept, by their hash.
export interface EventCodeStore {
  // Records the code for this learner, unless it is already recorded.
  insertIfAbsent: (codeHash: string, learnerId: string) => Promise<void>
  find: (codeHash: string) => Promise<{ learnerId: string; revoked: boolean } | undefined>
}

export type CodeState = { state: 'unbound' } | { state: 'bound'; learnerId: string } | { state: 'revoked' }

const REASONS = {
  INVALID_EVENT_CODE: 'the event code must be the 43 characters your event listener printed',
  EVENT_CODE_ALREADY_BOUND:
    'this event code belongs to another learner; ask your event listener for a new one',
  EVENT_CODE_REVOKED: 'this event code was revoked; use the new one your event listener prints',
}

function refused(code: keyof typeof REASONS): Refusal {
  return new Refusal(code, REASONS[code])
}

function hashOf(code: string): string {
  if (!isEventCode(code)) {
    throw refused('INVALID_EVENT_CODE')
  }
  return hash(code)
}

export async function stateOf(store: EventCodeStore, codeHash: string): Promise<CodeState> {
  const row = await store.find(codeHash)
  if (row === undefined) {
    return { state: 'unbound' }
  }
  return row.revoked ? { state: 'revoked' } : { state: 'bound', learnerId: row.learnerId }
}

// A code is bound once and never to another learner; binding it again to the
// same learner changes nothing.
export async function bind(store: EventCodeStore, learnerId: string, code: string): Promise<void> {
  const codeHash = hashOf(code)
  await store.insertIfAbsent(codeHash, learnerId)
  const state = await stateOf(store, codeHash)
  if (state.state === 'revoked') {
    throw refused('EVENT_CODE_REVOKED')
  }
  if (state.state !== 'bound' || state.learnerId !== learnerId) {
    throw refused('EVENT_CODE_ALREADY_BOUND')
  }
}

// Admits a connection made with a code, bound or not yet; returns its hash.
export async function admit(store: EventCodeStore, code: string): Promise<string> {
  const codeHash = hashOf(code)
  if ((await stateOf(store, codeHash)).state === 'revoked') {
    throw refused('EVENT_CODE_REVOKED')
  }
  return codeHash
}
