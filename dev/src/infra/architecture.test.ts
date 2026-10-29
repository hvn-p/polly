import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { architectureProcesses } from './architecture.ts'

const codeRoot = '/repo'
const host = 'arch.x.polly.localhost'
const local = join(codeRoot, 'tools/architecture/analyzer/target/release/architecture-analyzer')
const watch = [
  'watch',
  '--root',
  codeRoot,
  '--port',
  '4100',
  '--ui',
  join(codeRoot, 'tools/architecture/ui/dist'),
  '--base',
  'main',
  '--allow-host',
  host,
]

describe('the architecture view of a worktree', () => {
  it('C70: without a local build of the analyzer, runs the prebuilt one from its package', () => {
    const [, analyzer] = architectureProcesses({ codeRoot, port: 4100, host, exists: () => false })
    expect(analyzer).toEqual({
      name: 'architecture',
      command: process.execPath,
      args: [join(codeRoot, 'node_modules/@hvn-p/architecture/bin/architecture.js'), ...watch],
      cwd: codeRoot,
    })
  })

  it('runs the analyzer built in the worktree when there is one', () => {
    const [, analyzer] = architectureProcesses({
      codeRoot,
      port: 4100,
      host,
      exists: (path) => path === local,
    })
    expect(analyzer).toEqual({ name: 'architecture', command: local, args: watch, cwd: codeRoot })
  })

  it('rebuilds the view on each change, for the analyzer to serve', () => {
    const [view] = architectureProcesses({ codeRoot, port: 4100, host, exists: () => false })
    expect(view).toEqual({
      name: 'architecture-view',
      command: process.execPath,
      args: [join(codeRoot, 'tools/architecture/ui/node_modules/vite/bin/vite.js'), 'build', '--watch'],
      cwd: join(codeRoot, 'tools/architecture/ui'),
    })
  })
})
