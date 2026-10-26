// What runs before the API serves: the schema check, and the migrations that
// dev:up and the test setup apply.

import { type Kysely, sql } from 'kysely'
import { type Migration, Migrator } from 'kysely/migration'
import { migrations as shippedMigrations } from '../migrations/index.ts'

function migrator<DB>(db: Kysely<DB>, migrations: Record<string, Migration>): Migrator {
  return new Migrator({ db, provider: { getMigrations: async () => migrations } })
}

// Applies the pending migrations and returns their names.
export async function migrate<DB>(
  db: Kysely<DB>,
  migrations: Record<string, Migration> = shippedMigrations,
): Promise<string[]> {
  const { error, results = [] } = await migrator(db, migrations).migrateToLatest()
  if (error !== undefined) {
    throw error
  }
  return results.map(({ migrationName }) => migrationName)
}

export async function assertSchemaCurrent<DB>(
  db: Kysely<DB>,
  migrations: Record<string, Migration> = shippedMigrations,
): Promise<void> {
  const pending = (await migrator(db, migrations).getMigrations())
    .filter(({ executedAt }) => executedAt === undefined)
    .map(({ name }) => name)
  if (pending.length > 0) {
    throw new Error(`SCHEMA_BEHIND: ${pending.join(', ')} not applied; run nr dev:up`)
  }
}

// Empties every table but the migration bookkeeping, for a test run.
export async function emptyDatabase<DB>(db: Kysely<DB>): Promise<void> {
  const { rows } = await sql<{ name: string }>`
    select quote_ident(table_name) as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like 'kysely_migration%'
  `.execute(db)
  if (rows.length > 0) {
    await sql.raw(`truncate ${rows.map(({ name }) => name).join(', ')} cascade`).execute(db)
  }
}
