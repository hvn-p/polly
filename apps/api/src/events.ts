import { defineEvent } from '@polly/platform'

export const REQUEST_SERVED = defineEvent('api.request.served', {
  category: 'access',
  level: 'info',
  investigate: "one request's method, path, status and duration; a refusal shows here by its status",
})

export const REQUEST_FAILED = defineEvent('api.request.failed', {
  category: 'access',
  level: 'error',
  investigate: 'a request answered 500 on an unexpected error: read its stack',
})

export const COMMAND_REFUSED = defineEvent('api.command.refused', {
  category: 'technical',
  level: 'error',
  investigate: 'a command of the API refused to run: its code and reason say why',
})
