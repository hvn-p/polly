// Runs once before the worker's tests: refuses any database that is not a test
// database. DBOS creates its own schema in it at launch; the API's setup owns
// Polly's tables.

import { testDatabaseUrl } from '@polly/migrations'
import type { TestProject } from 'vitest/node'

export default function setup(project: TestProject): void {
  project.provide('testDatabaseUrl', testDatabaseUrl())
}

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string
  }
}
