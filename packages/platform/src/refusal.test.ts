import { describe, expect, it } from 'vitest'
import { Refusal } from './index.ts'

describe('Refusal', () => {
  it('carries its code and its reason, apart', () => {
    const refusal = new Refusal('INVALID_EVENT_CODE', 'an event code is 43 base64url characters')
    expect(refusal).toBeInstanceOf(Error)
    expect(refusal.code).toBe('INVALID_EVENT_CODE')
    expect(refusal.message).toBe('an event code is 43 base64url characters')
    expect(refusal.text).toBe('INVALID_EVENT_CODE: an event code is 43 base64url characters')
  })
})
