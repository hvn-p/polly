import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzerCommand, runAnalyzer } from './architecture.mjs'

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

describe('running the architecture check', () => {
  it('names what is missing, and how to get it, when there is no analyzer to run', () => {
    const lines: string[] = []
    const spawned: string[] = []
    const status = runAnalyzer(root, ['check'], {
      exists: () => false,
      spawn: (command) => {
        spawned.push(command)
        return { status: 0 }
      },
      write: (line) => lines.push(line),
    })
    expect(status).toBe(1)
    expect(spawned).toEqual([])
    expect(lines).toEqual([
      'ARCHITECTURE_ANALYZER_MISSING: no analyzer built in tools/architecture/analyzer, nor installed as @hvn-p/architecture; run pnpm install, or cargo build --release in tools/architecture/analyzer',
    ])
  })

  it('says why the analyzer could not start, and exits with its status once it ran', () => {
    const lines: string[] = []
    const failing = runAnalyzer(root, ['check'], {
      exists: (path) => path === local,
      spawn: () => ({ status: null, error: new Error('spawn EACCES') }),
      write: (line) => lines.push(line),
    })
    expect(failing).toBe(1)
    expect(lines).toEqual([`the architecture analyzer did not start: ${local}: spawn EACCES`])
    expect(
      runAnalyzer(root, ['check'], {
        exists: () => true,
        spawn: () => ({ status: 3 }),
        write: () => undefined,
      }),
    ).toBe(3)
  })
})
