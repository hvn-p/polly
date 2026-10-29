import { describe, expect, it } from 'vitest'
import { apiApplication } from './real.ts'

describe("the worktree's processes", () => {
  it('refuses a configuration without the architecture port rather than passing --port NaN', () => {
    expect(() => apiApplication().processes({})).toThrow(/POLLY_ARCH_PORT is missing/)
  })

  it("lets the analyzer answer the worktree's architecture host", () => {
    const analyzer = apiApplication()
      .processes({ POLLY_ARCH_PORT: '4100', POLLY_WORKTREE_ID: 'x' })
      .find((process) => process.name === 'architecture')
    const args = analyzer?.args ?? []
    expect(args.slice(args.indexOf('--allow-host'))).toEqual(['--allow-host', 'arch.x.polly.localhost'])
  })

  it('refuses a configuration without the worktree identity rather than allowing no host', () => {
    expect(() => apiApplication().processes({ POLLY_ARCH_PORT: '4100' })).toThrow(
      /POLLY_WORKTREE_ID is missing/,
    )
  })
})
