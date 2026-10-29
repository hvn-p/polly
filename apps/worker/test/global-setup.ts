// Runs once before the worker's tests: refuses any database that is not a test
// database, then brings it to the shipped schema, which the worker waits for.
// DBOS creates its own schema in it at launch; the API's setup empties Polly's
// tables.

import { connect, migrate, testDatabaseUrl } from '@polly/migrations'
import type { TestProject } from 'vitest/node'

export default async function setup(project: TestProject): Promise<void> {
  const url = testDatabaseUrl(process.env)
  const db = connect(url)
  try {
    await migrate(db)
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
