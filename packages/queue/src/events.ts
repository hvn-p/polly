import { defineEvent } from '@polly/platform'

// What DBOS reports, at the level it gives.
export const DBOS_DEBUG = defineEvent('queue.dbos.debug', {
  category: 'technical',
  level: 'debug',
  investigate: "DBOS's own detail",
})

export const DBOS_INFO = defineEvent('queue.dbos.info', {
  category: 'technical',
  level: 'info',
  investigate: "DBOS's own report: its message says what",
})

export const DBOS_WARNING = defineEvent('queue.dbos.warning', {
  category: 'technical',
  level: 'warn',
  investigate: 'DBOS handled a problem: its message says what',
})

export const DBOS_ERROR = defineEvent('queue.dbos.error', {
  category: 'technical',
  level: 'error',
  investigate: 'DBOS failed an operation: its message says what',
})
