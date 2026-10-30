// The API's refusals, part of its contract (nr contracts): the one list of
// codes a caller acts on. Each operation names the ones it may answer, and its
// refusal body is this schema with its code narrowed to them.

import { z } from 'zod'

export const refusalCode = z.enum([
  'UNAUTHORIZED',
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_OAUTH_REQUEST',
  'INVALID_EVENT_CODE',
  'EVENT_CODE_REVOKED',
  'EVENT_CODE_NOT_BOUND',
  'EVENT_CODE_ALREADY_BOUND',
])

export type RefusalCode = z.infer<typeof refusalCode>

// A refusal's code, which the caller acts on, and its reason, for a person.
export const refusal = z.object({ code: refusalCode, reason: z.string().max(512).optional() })
