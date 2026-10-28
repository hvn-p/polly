import { describe, expect, it } from 'vitest'
import type { EventCodeStore } from '../../domains/event-codes/index.ts'
import { bindingOf, connectEventStream } from './index.ts'

describe('event stream connection', () => {
  it('admits a well-formed code and reads its binding', async () => {
    const store: EventCodeStore = { insertIfAbsent: async () => {}, find: async () => undefined }
    const codeHash = await connectEventStream({ codes: store }, 'c'.repeat(43))
    expect(await bindingOf({ codes: store }, codeHash)).toEqual({ state: 'unbound' })
  })
})
