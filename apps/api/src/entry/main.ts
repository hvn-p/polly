// Serves the API on $POLLY_API_HOST:$POLLY_API_PORT: loopback locally, where
// the front-end dev server proxies the worktree's origin to it, every
// interface in a container. Serves nothing while the database is
// behind the code (SCHEMA_BEHIND), and starts once nr dev:up has migrated it.

import { isIP } from 'node:net'
import { readConfig } from './config.ts'
import { startWhenSchemaCurrent } from './server.ts'

const hostname = process.env['POLLY_API_HOST'] ?? ''
const port = Number(process.env['POLLY_API_PORT'])
const invalid = [
  ...(isIP(hostname) === 0 ? ['POLLY_API_HOST'] : []),
  ...(Number.isInteger(port) && port > 0 ? [] : ['POLLY_API_PORT']),
]
if (invalid.length > 0) {
  console.error(`INVALID_CONFIGURATION: ${invalid.join(', ')}`)
  process.exit(1)
}
try {
  const server = await startWhenSchemaCurrent({
    config: readConfig(process.env),
    hostname,
    port,
    retryMs: 2000,
    onBehind: (message) => console.error(message),
  })
  console.log(`API listening on ${server.url}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
