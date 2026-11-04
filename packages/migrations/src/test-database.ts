// The database tests run against: the worktree's test database, never another.
// Locally its URL comes from .env.local, in CI from the job.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

export function assertTestDatabase(url: string | undefined): string {
  if (url === undefined || url === '') {
    throw new Error(
      'NOT_A_TEST_DATABASE: TEST_DATABASE_URL is not set; run nr dev:up to create the test database',
    )
  }
  const name = decodeURIComponent(new URL(url).pathname.slice(1))
  // An identity never holds a doubled separator, so only a test database ends in `__test`:
  // `polly_x_test` is identity x-test's development database.
  if (!/^polly_[a-z0-9]+(_[a-z0-9]+)*__test$/.test(name)) {
    throw new Error(`NOT_A_TEST_DATABASE: ${name || '(none)'} does not end in __test; tests never touch it`)
  }
  return url
}

// The test database's URL, once checked to name a test database: the
// environment's, otherwise .env.local's.
export function testDatabaseUrl(env: Record<string, string | undefined>): string {
  if (env['TEST_DATABASE_URL'] !== undefined) {
    return assertTestDatabase(env['TEST_DATABASE_URL'])
  }
  const envFile = join(import.meta.dirname, '..', '..', '..', '.env.local')
  return assertTestDatabase(
    existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8'))['TEST_DATABASE_URL'] : undefined,
  )
}
