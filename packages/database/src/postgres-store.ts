// The domains' storage ports over Postgres: every SQL query Polly runs lives
// here. An event code is kept as its hash only.

import type { EventCodeStore } from '@polly/back'
import type { Database } from './connection.ts'

export class PostgresStore implements EventCodeStore {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async insertIfAbsent(codeHash: string, learnerId: string): Promise<void> {
    await this.#db
      .insertInto('agent_event_code')
      .values({ code_hash: codeHash, learner_id: learnerId })
      .onConflict((conflict) => conflict.column('code_hash').doNothing())
      .execute()
  }

  async find(codeHash: string): Promise<{ learnerId: string; revoked: boolean } | undefined> {
    const row = await this.#db
      .selectFrom('agent_event_code')
      .select(['learner_id', 'revoked_at'])
      .where('code_hash', '=', codeHash)
      .executeTakeFirst()
    return row === undefined ? undefined : { learnerId: row.learner_id, revoked: row.revoked_at !== null }
  }
}
