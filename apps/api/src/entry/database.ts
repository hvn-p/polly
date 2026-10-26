import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

// The tables the API's own code queries; Better Auth's are its own.
// biome-ignore lint/complexity/noBannedTypes: no table of the API's own yet.
export type Database = {}

export function createDatabase(url: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 5 }) }),
  })
}
