import { describe, expect, it } from 'vitest'
import { apiApplication } from './real.ts'

describe("the worktree's processes", () => {
  it('refuses a configuration without the architecture port rather than passing --port NaN', () => {
    expect(() => apiApplication().processes({})).toThrow(/POLLY_ARCH_PORT is missing/)
  })
})
