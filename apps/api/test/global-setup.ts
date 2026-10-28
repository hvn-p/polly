// Runs once before the API tests: refuses any database that is not a test
// database, then brings the worktree's test database to the shipped schema and
// empties it.

import { connect, migrate, testDatabaseUrl } from '@polly/migrations'
import { type Kysely, sql } from 'kysely'
import type { TestProject } from 'vitest/node'

// Empties every table but the migration bookkeeping, for a test run.
async function emptyDatabase<DB>(db: Kysely<DB>): Promise<void> {
  const { rows } = await sql<{ name: string }>`
    select quote_ident(table_name) as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like 'kysely_migration%'
  `.execute(db)
  if (rows.length > 0) {
    await sql.raw(`truncate ${rows.map(({ name }) => name).join(', ')} cascade`).execute(db)
  }
}

export default async function setup(project: TestProject): Promise<void> {
  const url = testDatabaseUrl()
  const db = connect(url)
  try {
    await migrate(db)
    await emptyDatabase(db)
  } finally {
    await db.destroy()
  }
  project.provide('testDatabaseUrl', url)
}

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string
  }
}
