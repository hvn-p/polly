// The architecture view of a worktree: Vite rebuilds the view on each change,
// and the analyzer, in watch mode, serves it with the branch compared to main,
// to requests addressed to its port or to the worktree's architecture host.
// The analyzer is the one built in the worktree when there is one (whoever
// changes it builds it with cargo), the prebuilt package otherwise, once a
// published version holds the view; with neither, nothing runs.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SupervisedProcess } from '../ports/index.ts'

export interface ArchitectureOptions {
  codeRoot: string
  port: number
  host: string
  exists?: (path: string) => boolean
}

export type Analyzer = 'local' | 'prebuilt' | 'missing'

const LOCAL_BUILD = 'tools/architecture/analyzer/target/release/architecture-analyzer'

// Which analyzer the worktree can run.
export function analyzerOf(codeRoot: string, exists: (path: string) => boolean = existsSync): Analyzer {
  if (exists(join(codeRoot, LOCAL_BUILD))) {
    return 'local'
  }
  return exists(join(codeRoot, 'node_modules/@hvn-p/architecture/view')) ? 'prebuilt' : 'missing'
}

export function architectureProcesses({
  codeRoot,
  port,
  host,
  exists = existsSync,
}: ArchitectureOptions): SupervisedProcess[] {
  const ui = join(codeRoot, 'tools/architecture/ui')
  const analyzer = analyzerOf(codeRoot, exists)
  if (analyzer === 'missing') {
    return []
  }
  const local = join(codeRoot, LOCAL_BUILD)
  const prebuilt = join(codeRoot, 'node_modules/@hvn-p/architecture/bin/architecture.js')
  const watch = [
    'watch',
    '--root',
    codeRoot,
    '--port',
    String(port),
    '--ui',
    join(ui, 'dist'),
    '--base',
    'main',
    '--allow-host',
    host,
  ]
  return [
    {
      name: 'architecture-view',
      command: process.execPath,
      args: [join(ui, 'node_modules/vite/bin/vite.js'), 'build', '--watch'],
      cwd: ui,
    },
    analyzer === 'local'
      ? { name: 'architecture', command: local, args: watch, cwd: codeRoot }
      : { name: 'architecture', command: process.execPath, args: [prebuilt, ...watch], cwd: codeRoot },
  ]
}
