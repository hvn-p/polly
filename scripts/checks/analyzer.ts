// The architecture analyzer's command: the one built in the worktree when there
// is one, so a change to the analyzer is checked by itself; the pinned package
// otherwise.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

// The command and its arguments.
export function analyzerCommand(
  root: string,
  args: string[],
  exists: (path: string) => boolean = existsSync,
): string[] {
  const local = join(root, 'tools/architecture/analyzer/target/release/architecture-analyzer')
  return exists(local)
    ? [local, ...args]
    : [process.execPath, join(root, 'node_modules/@hvn-p/architecture/bin/architecture.js'), ...args]
}
