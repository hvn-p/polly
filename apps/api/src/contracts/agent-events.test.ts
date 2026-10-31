import { EVENT_CODE_LENGTH, EVENT_CODE_PATTERN } from '@polly/kernel'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { eventCode } from './agent-events.ts'

describe('the event code of the contract', () => {
  it("is the kernel's definition: its length and alphabet", () => {
    expect(z.toJSONSchema(eventCode)).toMatchObject({
      minLength: EVENT_CODE_LENGTH,
      maxLength: EVENT_CODE_LENGTH,
      pattern: EVENT_CODE_PATTERN.source,
    })
  })
})
