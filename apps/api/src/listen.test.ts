import { describe, expect, it } from 'vitest'
import { ownOrigin } from './listen.ts'

describe("the API's own origin, from its listen address", () => {
  it('reads a wildcard address back on loopback', () => {
    expect(ownOrigin('0.0.0.0', 4000)).toBe('http://127.0.0.1:4000')
    expect(ownOrigin('::', 4000)).toBe('http://[::1]:4000')
  })

  it('keeps a specific address', () => {
    expect(ownOrigin('127.0.0.1', 4000)).toBe('http://127.0.0.1:4000')
    expect(ownOrigin('10.0.1.7', 4000)).toBe('http://10.0.1.7:4000')
    expect(ownOrigin('::1', 4000)).toBe('http://[::1]:4000')
  })
})
