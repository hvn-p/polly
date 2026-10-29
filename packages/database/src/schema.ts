// Whether the database is at the schema the code was generated against: a
// process refuses to serve on a database behind it.

import { setTimeout as sleep } from 'node:timers/promises'
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
  // Two queries: Postgres resolves every table a query names before it runs,
  // so one naming kysely_migration fails on a never-migrated database.
  const { rows: tables } = await sql<{ found: boolean }>`
    select to_regclass('kysely_migration') is not null as found
  `.execute(db)
  const applied =
    tables[0]?.found === true &&
    (await sql`select from kysely_migration where name = ${last}`.execute(db)).rows.length > 0
  if (!applied) {
    throw new SchemaBehind(last)
  }
}

export interface SchemaWait {
  retryMs: number
  onBehind: (message: string) => void
  // The last migration the database must hold, read on each check; tests name
  // one it lacks.
  last?: string
}

// Returns once the database holds the code's schema. While it is behind, the
// refusal is reported once and the check runs again, so every process that
// opens the database comes up by itself once dev:up has migrated it.
export async function waitForSchemaCurrent(db: Database, options: SchemaWait): Promise<void> {
  let reported = false
  for (;;) {
    try {
      await assertSchemaCurrent(db, options.last)
      return
    } catch (error) {
      if (!(error instanceof SchemaBehind)) {
        throw error
      }
      if (!reported) {
        options.onBehind(error.message)
        reported = true
      }
      await sleep(options.retryMs)
    }
  }
}
