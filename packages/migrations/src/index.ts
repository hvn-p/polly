// Polly's migrations: run (dev:up, the tests' setups, the deployment), never
// imported by a process. A process checks the schema through @polly/database.

export { connect } from './connect.ts'
export { migrate } from './migrate.ts'
export { migrations } from './migrations/index.ts'
export { assertTestDatabase, testDatabaseUrl } from './test-database.ts'
