// Whether the database is at the schema the code was generated against: a
// process refuses to serve on a database behind it.

import { sql } from 'kysely'
import type { Database } from './connection.ts'
import { LAST_MIGRATION } from './generated/last-migration.ts'

export class SchemaBehind extends Error {
  readonly code = 'SCHEMA_BEHIND'

  constructor(missing: string) {
    super(`SCHEMA_BEHIND: ${missing} not applied; run nr dev:up`)
  }
}

export async function assertSchemaCurrent(db: Database, last: string = LAST_MIGRATION): Promise<void> {
  const { rows } = await sql<{ applied: boolean }>`
    select exists (
      select from information_schema.tables where table_schema = 'public' and table_name = 'kysely_migration'
    ) and exists (select from kysely_migration where name = ${last}) as applied
  `.execute(db)
  if (rows[0]?.applied !== true) {
    throw new SchemaBehind(last)
  }
}
