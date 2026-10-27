// Brings a database to the schema of the shipped migrations, and checks that
// it is there before a process serves.

import type { Kysely } from 'kysely'
import { type Migration, Migrator } from 'kysely/migration'
import { migrations as shippedMigrations } from './migrations/index.ts'

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

// The database lacks shipped migrations: a process refuses to serve on it.
export class SchemaBehind extends Error {
  readonly code = 'SCHEMA_BEHIND'

  constructor(pending: readonly string[]) {
    super(`SCHEMA_BEHIND: ${pending.join(', ')} not applied; run nr dev:up`)
  }
}

export async function assertSchemaCurrent<DB>(
  db: Kysely<DB>,
  migrations: Record<string, Migration> = shippedMigrations,
): Promise<void> {
  const pending = (await migrator(db, migrations).getMigrations())
    .filter(({ executedAt }) => executedAt === undefined)
    .map(({ name }) => name)
  if (pending.length > 0) {
    throw new SchemaBehind(pending)
  }
}
