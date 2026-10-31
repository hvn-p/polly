import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

// A connection for migrating, which knows no table.
export function connect(url: string): Kysely<unknown> {
  return new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 2 }) }),
  })
}
