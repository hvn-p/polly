import { defineEvent } from '@polly/platform'

export const REQUEST_SERVED = defineEvent('mcp.request.served', {
  category: 'access',
  level: 'info',
  investigate: "one request's method, path, status and duration; a refusal shows here by its status",
})

export const REQUEST_FAILED = defineEvent('mcp.request.failed', {
  category: 'access',
  level: 'error',
  investigate: 'a request answered 500 on an unexpected error, such as the identity down: read its stack',
})
