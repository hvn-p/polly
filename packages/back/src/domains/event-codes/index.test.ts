import { Refusal } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { admit, bind, type EventCodeStore, stateOf } from './index.ts'

// The store in memory: what the database does, keyed by the code's hash.
function memoryStore() {
  const rows = new Map<string, { learnerId: string; revoked: boolean }>()
  const store: EventCodeStore = {
    insertIfAbsent: async (codeHash, learnerId) => {
      if (!rows.has(codeHash)) {
        rows.set(codeHash, { learnerId, revoked: false })
      }
    },
    find: async (codeHash) => rows.get(codeHash),
  }
  return { store, rows }
}

const code = 'a'.repeat(43)

async function refusalOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(Refusal)
  return (error as Refusal).code
}

describe('event codes', () => {
  it('C55: refuses a malformed code', async () => {
    const { store } = memoryStore()
    expect(await refusalOf(bind(store, 'a', 'short'))).toBe('INVALID_EVENT_CODE')
    expect(await refusalOf(admit(store, `${'a'.repeat(42)}+`))).toBe('INVALID_EVENT_CODE')
  })

  it('C52: a code bound to one learner is never bound to another', async () => {
    const { store, rows } = memoryStore()
    await bind(store, 'learner-a', code)
    expect(await refusalOf(bind(store, 'learner-b', code))).toBe('EVENT_CODE_ALREADY_BOUND')
    expect([...rows.values()]).toEqual([{ learnerId: 'learner-a', revoked: false }])
  })

  it('C53: binding again to the same learner changes nothing', async () => {
    const { store, rows } = memoryStore()
    await bind(store, 'learner-a', code)
    await bind(store, 'learner-a', code)
    expect(rows.size).toBe(1)
  })

  it('C54: a revoked code is refused, to bind and to connect', async () => {
    const { store, rows } = memoryStore()
    await bind(store, 'learner-a', code)
    for (const row of rows.values()) {
      row.revoked = true
    }
    expect(await refusalOf(bind(store, 'learner-a', code))).toBe('EVENT_CODE_REVOKED')
    expect(await refusalOf(admit(store, code))).toBe('EVENT_CODE_REVOKED')
  })

  it('stores the hash only, and reads the state of a connection by it', async () => {
    const { store, rows } = memoryStore()
    const codeHash = await admit(store, code)
    expect(await stateOf(store, codeHash)).toEqual({ state: 'unbound' })
    await bind(store, 'learner-a', code)
    expect([...rows.keys()]).toEqual([codeHash])
    expect(codeHash).not.toContain(code)
    expect(await stateOf(store, codeHash)).toEqual({ state: 'bound', learnerId: 'learner-a' })
  })
})
