import { defineEvent } from '@polly/platform'

export const COMPUTE_VERSION_MISMATCHED = defineEvent('worker.compute_version.mismatched', {
  category: 'technical',
  level: 'warn',
  investigate:
    "the compute service runs other code than the worktree's services/compute: rebuild it, or mean it",
})

export const COMPUTE_VERSION_UNKNOWN = defineEvent('worker.compute_version.unknown', {
  category: 'technical',
  level: 'warn',
  investigate: 'the compute service did not report its version: is it up at that URL?',
})

// What DBOS reports, at the level it gives.
export const DBOS_DEBUG = defineEvent('worker.dbos.debug', {
  category: 'technical',
  level: 'debug',
  investigate: "DBOS's own detail",
})

export const DBOS_INFO = defineEvent('worker.dbos.info', {
  category: 'technical',
  level: 'info',
  investigate: "DBOS's own report: its message says what",
})

export const DBOS_WARNING = defineEvent('worker.dbos.warning', {
  category: 'technical',
  level: 'warn',
  investigate: 'DBOS handled a problem: its message says what',
})

export const DBOS_ERROR = defineEvent('worker.dbos.error', {
  category: 'technical',
  level: 'error',
  investigate: 'DBOS failed an operation: its message says what',
})
