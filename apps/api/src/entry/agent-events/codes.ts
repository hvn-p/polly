// The event codes' store over Postgres: the back's EventCodeStore port. A code
// is kept as its hash only.

import type { EventCodeStore } from '@polly/back'
import type { Kysely } from 'kysely'
import type { Database } from '../database.ts'

export function eventCodeStore(db: Kysely<Database>): EventCodeStore {
  return {
    insertIfAbsent: async (codeHash, learnerId) => {
      await db
        .insertInto('agent_event_code')
        .values({ code_hash: codeHash, learner_id: learnerId })
        .onConflict((conflict) => conflict.column('code_hash').doNothing())
        .execute()
    },
    find: async (codeHash) => {
      const row = await db
        .selectFrom('agent_event_code')
        .select(['learner_id', 'revoked_at'])
        .where('code_hash', '=', codeHash)
        .executeTakeFirst()
      return row === undefined ? undefined : { learnerId: row.learner_id, revoked: row.revoked_at !== null }
    },
  }
}
