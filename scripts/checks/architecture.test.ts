import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzerCommand } from './architecture.mjs'

const root = '/repo'
const local = join(root, 'tools/architecture/analyzer/target/release/architecture-analyzer')

describe('the architecture check', () => {
  it("runs the analyzer built in the worktree when there is one, as dev:up's view does", () => {
    expect(analyzerCommand(root, ['check'], (path) => path === local)).toEqual([local, 'check'])
  })

  it('runs the pinned package otherwise', () => {
    expect(analyzerCommand(root, ['check'], () => false)).toEqual([
      process.execPath,
      join(root, 'node_modules/@hvn-p/architecture/bin/architecture.js'),
      'check',
    ])
  })
})
