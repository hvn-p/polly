// Polly's database: its migrations, and what brings a database to them. The
// database belongs to Polly, not to one of its processes; the API and the
// worker are two of its consumers.

import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

export { migrations } from './migrations/index.ts'
export { assertSchemaCurrent, migrate } from './migrator.ts'

export function connect<DB>(url: string): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 5 }) }),
  })
}
