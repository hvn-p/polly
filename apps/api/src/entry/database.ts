import { type Generated, Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

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
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 5 }) }),
  })
}
