import { connect } from '@polly/database'
import type { Generated, Kysely } from 'kysely'

// The tables the API's own code queries; Better Auth's are its own.
export interface Database {
  agent_event_code: {
    code_hash: string
    learner_id: string
    bound_at: Generated<Date>
    revoked_at: Date | null
  }
}

export function createDatabase(url: string): Kysely<Database> {
  return connect<Database>(url)
}
