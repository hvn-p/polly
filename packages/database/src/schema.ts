// Whether the database is at the schema the code was generated against: a
// process refuses to serve on a database behind it.

import { setTimeout as sleep } from 'node:timers/promises'
import { log } from '@polly/platform/log'
import { sql } from 'kysely'
import { connect, type Database } from './connection.ts'
import { SCHEMA_BEHIND } from './events.ts'
import { LAST_MIGRATION } from './generated/last-migration.ts'

export class SchemaBehind extends Error {
  readonly code = 'SCHEMA_BEHIND'
  readonly missing: string

  constructor(missing: string) {
    super(`SCHEMA_BEHIND: ${missing} not applied; run nr dev:up`)
    this.missing = missing
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
  // The last migration the database must hold, read on each check; tests name
  // one it lacks.
  last?: string
}

// Returns once the database at this URL holds the code's schema, the step
// before a process that opens it starts. While it is behind, that is logged
// once and the check runs again, so every such process comes up by itself once
// dev:up has migrated the database.
export async function waitForSchema(databaseUrl: string, options: SchemaWait): Promise<void> {
  const db = connect(databaseUrl)
  let reported = false
  try {
    for (;;) {
      try {
        await assertSchemaCurrent(db, options.last)
        return
      } catch (error) {
        if (!(error instanceof SchemaBehind)) {
          throw error
        }
        if (!reported) {
          log(SCHEMA_BEHIND, { missing: error.missing })
          reported = true
        }
        await sleep(options.retryMs)
      }
    }
  } finally {
    await db.destroy()
  }
}
