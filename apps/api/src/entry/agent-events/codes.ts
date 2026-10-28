// Event codes: a secret an event listener draws, bound once to a learner
// through start_lesson, active until revoked. Stored as its SHA-256 only, and
// never logged.

import { hash } from '@polly/kernel'
import type { Kysely } from 'kysely'
import type { Database } from '../database.ts'

export type CodeState = { state: 'unbound' } | { state: 'bound'; learnerId: string } | { state: 'revoked' }

export type BindOutcome = 'bound' | 'EVENT_CODE_ALREADY_BOUND' | 'EVENT_CODE_REVOKED'

export function eventCodes(db: Kysely<Database>) {
  const stateOf = async (codeHash: string): Promise<CodeState> => {
    const row = await db
      .selectFrom('agent_event_code')
      .select(['learner_id', 'revoked_at'])
      .where('code_hash', '=', codeHash)
      .executeTakeFirst()
    if (row === undefined) {
      return { state: 'unbound' }
    }
    return row.revoked_at === null ? { state: 'bound', learnerId: row.learner_id } : { state: 'revoked' }
  }

  return {
    stateOf,
    // A code is bound once and never to another learner; binding it again to
    // the same learner changes nothing.
    bind: async (learnerId: string, code: string): Promise<BindOutcome> => {
      const codeHash = hash(code)
      await db
        .insertInto('agent_event_code')
        .values({ code_hash: codeHash, learner_id: learnerId })
        .onConflict((conflict) => conflict.column('code_hash').doNothing())
        .execute()
      const state = await stateOf(codeHash)
      if (state.state === 'revoked') {
        return 'EVENT_CODE_REVOKED'
      }
      return state.state === 'bound' && state.learnerId === learnerId ? 'bound' : 'EVENT_CODE_ALREADY_BOUND'
    },
  }
}

export type EventCodes = ReturnType<typeof eventCodes>
