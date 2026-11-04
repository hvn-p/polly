import { describe, expect, it } from 'vitest'
import { originOf } from './index.ts'

describe('the origin a process is reached on, from its listen address', () => {
  it('reads a wildcard address back on loopback', () => {
    expect(originOf('0.0.0.0', 4000)).toBe('http://127.0.0.1:4000')
    expect(originOf('::', 4000)).toBe('http://[::1]:4000')
  })

  it('keeps a specific address', () => {
    expect(originOf('127.0.0.1', 4000)).toBe('http://127.0.0.1:4000')
    expect(originOf('10.0.1.7', 4000)).toBe('http://10.0.1.7:4000')
    expect(originOf('::1', 4000)).toBe('http://[::1]:4000')
  })
})
