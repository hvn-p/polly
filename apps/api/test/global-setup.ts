// Runs once before the API tests: refuses any database that is not a test
// database, then brings the worktree's test database to the code's schema and
// empties it. Locally the URL comes from .env.local, in CI from the job.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import type { TestProject } from 'vitest/node'

export function assertTestDatabase(url: string | undefined): string {
  if (url === undefined || url === '') {
    throw new Error(
      'NOT_A_TEST_DATABASE: TEST_DATABASE_URL is not set; run nr dev:up to create the test database',
    )
  }
  const name = decodeURIComponent(new URL(url).pathname.slice(1))
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`NOT_A_TEST_DATABASE: ${name || '(none)'} does not end in _test; tests never touch it`)
  }
  return url
}

function testDatabaseUrl(): string | undefined {
  if (process.env['TEST_DATABASE_URL'] !== undefined) {
    return process.env['TEST_DATABASE_URL']
  }
  const envFile = join(import.meta.dirname, '..', '..', '..', '.env.local')
  return existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8'))['TEST_DATABASE_URL'] : undefined
}

export default async function setup(project: TestProject): Promise<void> {
  const url = assertTestDatabase(testDatabaseUrl())
  const { createDatabase } = await import('../src/entry/database.ts')
  const { emptyDatabase, migrate } = await import('../src/entry/startup.ts')
  const db = createDatabase(url)
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
