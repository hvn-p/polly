// Brings a database to the schema of the shipped migrations.

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
