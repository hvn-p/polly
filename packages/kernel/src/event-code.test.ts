import { describe, expect, it } from 'vitest'
import { hash, isEventCode } from './index.ts'

describe('event code', () => {
  it('C49: is exactly 43 base64url characters', () => {
    expect(isEventCode('a'.repeat(43))).toBe(true)
    expect(isEventCode('Az09_-'.repeat(7).concat('x'))).toBe(true)
    expect(isEventCode('a'.repeat(42))).toBe(false)
    expect(isEventCode('a'.repeat(44))).toBe(false)
    expect(isEventCode(`${'a'.repeat(42)}+`)).toBe(false)
  })
})

describe('hash', () => {
  it('is the hex SHA-256', () => {
    expect(hash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
