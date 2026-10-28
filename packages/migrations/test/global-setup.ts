// Runs once before the database tests: refuses any database that is not a
// test database, then brings it to the shipped schema. It empties nothing: the
// API tests' setup does, and both run against the same test database.

import type { TestProject } from 'vitest/node'
import { connect, migrate, testDatabaseUrl } from '../src/index.ts'

export default async function setup(project: TestProject): Promise<void> {
  const url = testDatabaseUrl()
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
