import { defineEvent } from '@polly/platform'

export const PROCESS_STARTED = defineEvent('logging.process.started', {
  category: 'technical',
  level: 'info',
  investigate: 'the process is up: its address or queue, when it last started',
})

export const PROCESS_REFUSED = defineEvent('logging.process.refused', {
  category: 'technical',
  level: 'error',
  investigate: 'the process refused to start: its code names what is missing or invalid',
})

export const PROCESS_FAILED = defineEvent('logging.process.failed', {
  category: 'technical',
  level: 'error',
  investigate: 'the process stopped on an unexpected error: read its stack',
})
