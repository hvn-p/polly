// Serves the API on $POLLY_API_HOST:$POLLY_API_PORT: loopback locally, where
// the front-end dev server proxies the worktree's origin to it, every
// interface in a container. Serves nothing while the database is
// behind the code (SCHEMA_BEHIND), and starts once nr dev:up has migrated it.

import { isIP } from 'node:net'
import { readConfig } from './config.ts'
import { configureLogging, logger } from './logger.ts'
import { startWhenSchemaCurrent } from './server.ts'

await configureLogging()
const log = logger('main')

const hostname = process.env['POLLY_API_HOST'] ?? ''
const port = Number(process.env['POLLY_API_PORT'])
const invalid = [
  ...(isIP(hostname) === 0 ? ['POLLY_API_HOST'] : []),
  ...(Number.isInteger(port) && port > 0 ? [] : ['POLLY_API_PORT']),
]
if (invalid.length > 0) {
  log.error('INVALID_CONFIGURATION: {keys}', { keys: invalid })
  process.exit(1)
}
try {
  const server = await startWhenSchemaCurrent({
    config: readConfig(process.env),
    hostname,
    port,
    retryMs: 2000,
    onBehind: (message) => log.warn('{message}', { message }),
  })
  log.info('API listening on {url}', { url: server.url })
} catch (error) {
  log.fatal('the API stopped: {error}', { error })
  process.exit(1)
}
