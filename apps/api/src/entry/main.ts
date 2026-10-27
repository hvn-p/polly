// Serves the API on 127.0.0.1:$POLLY_API_PORT; the front-end dev server
// proxies the worktree's origin to it. Serves nothing while the database is
// behind the code (SCHEMA_BEHIND), and starts once nr dev:up has migrated it.

import { readConfig } from './config.ts'
import { startWhenSchemaCurrent } from './server.ts'

const port = Number(process.env['POLLY_API_PORT'])
if (!Number.isInteger(port) || port <= 0) {
  console.error('INVALID_CONFIGURATION: POLLY_API_PORT')
  process.exit(1)
}
try {
  const server = await startWhenSchemaCurrent({
    config: readConfig(process.env),
    port,
    retryMs: 2000,
    onBehind: (message) => console.error(message),
  })
  console.log(`API listening on ${server.url}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
