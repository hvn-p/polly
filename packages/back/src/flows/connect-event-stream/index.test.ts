import { describe, expect, it } from 'vitest'
import type { EventCodeStore } from '../../domains/event-codes/index.ts'
import { bindingOf, connectEventStream } from './index.ts'

describe('event stream connection', () => {
  it('admits a well-formed code and reads its binding', async () => {
    const store: EventCodeStore = { insertIfAbsent: async () => {}, find: async () => undefined }
    const codeHash = await connectEventStream({ codes: store }, 'c'.repeat(43))
    expect(await bindingOf({ codes: store }, codeHash)).toEqual({ state: 'unbound' })
  })

  it('refuses a code revoked while its connection waits for a binding', async () => {
    const store: EventCodeStore = {
      insertIfAbsent: async () => {},
      find: async () => ({ learnerId: 'learner-1', revoked: true }),
    }
    await expect(bindingOf({ codes: store }, 'hash')).rejects.toMatchObject({ code: 'EVENT_CODE_REVOKED' })
  })
})
