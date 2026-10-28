import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { DB } from './generated/tables.ts'

// Polly's database, typed by the tables generated from its migrations.
export type Database = Kysely<DB>

export function connect(url: string): Database {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 5 }) }),
  })
}
