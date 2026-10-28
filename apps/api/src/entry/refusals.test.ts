import { Refusal } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { refusalResponse } from './refusals.ts'

describe('refusal translation', () => {
  it('turns a refusal into an HTTP response carrying its code and reason, with its status', async () => {
    for (const [code, status] of [
      ['UNAUTHORIZED', 401],
      ['INVALID_EVENT_CODE', 400],
      ['EVENT_CODE_REVOKED', 403],
      ['NOT_FOUND', 404],
      ['EVENT_CODE_ALREADY_BOUND', 409],
    ] as const) {
      const response = refusalResponse(new Refusal(code, 'why'))
      expect(response.status).toBe(status)
      expect(await response.json()).toEqual({ code, reason: 'why' })
    }
  })
})
