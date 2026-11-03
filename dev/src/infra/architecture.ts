// The analyzer of a worktree's architecture view (dev/worktree.compose.yaml
// runs it, and Vite rebuilding the view). The analyzer is the one built in the worktree when there is one (whoever
// changes it builds it with cargo), the prebuilt package otherwise, once a
// published version holds the view; with neither, nothing runs.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
export type Analyzer = 'local' | 'prebuilt' | 'missing'

const LOCAL_BUILD = 'tools/architecture/analyzer/target/release/architecture-analyzer'

// Which analyzer the worktree can run.
export function analyzerOf(codeRoot: string, exists: (path: string) => boolean = existsSync): Analyzer {
  if (exists(join(codeRoot, LOCAL_BUILD))) {
    return 'local'
  }
  return exists(join(codeRoot, 'node_modules/@hvn-p/architecture/view')) ? 'prebuilt' : 'missing'
}

// The analyzer the worktree's architecture view runs, or undefined when it has
// none holding the view.
export function analyzerPathOf(
  codeRoot: string,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  switch (analyzerOf(codeRoot, exists)) {
    case 'local':
      return join(codeRoot, LOCAL_BUILD)
    case 'prebuilt':
      return join(codeRoot, 'node_modules/@hvn-p/architecture/bin/architecture.js')
    default:
      return undefined
  }
}
