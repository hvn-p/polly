import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzerOf, analyzerPathOf } from './architecture.ts'

const codeRoot = '/repo'
const local = join(codeRoot, 'tools/architecture/analyzer/target/release/architecture-analyzer')
// What a published package holding the view carries.
const prebuiltView = join(codeRoot, 'node_modules/@hvn-p/architecture/view')

describe('the analyzer of a worktree', () => {
  it('C70: without a local build of the analyzer, runs the prebuilt one from its package', () => {
    const exists = (path: string) => path === prebuiltView
    expect(analyzerOf(codeRoot, exists)).toBe('prebuilt')
    expect(analyzerPathOf(codeRoot, exists)).toBe(
      join(codeRoot, 'node_modules/@hvn-p/architecture/bin/architecture.js'),
    )
  })

  it('runs the analyzer built in the worktree when there is one', () => {
    const exists = (path: string) => path === local || path === prebuiltView
    expect(analyzerOf(codeRoot, exists)).toBe('local')
    expect(analyzerPathOf(codeRoot, exists)).toBe(local)
  })

  it('runs none when neither a local build nor the installed package holds the view', () => {
    expect(analyzerOf(codeRoot, () => false)).toBe('missing')
    expect(analyzerPathOf(codeRoot, () => false)).toBeUndefined()
  })
})
