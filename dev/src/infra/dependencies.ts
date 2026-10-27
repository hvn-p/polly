// Installs the workspace's dependencies, as the lockfile pins them. Its output
// goes to stderr: dev:up's stdout is the worktree URL.

import { execFileSync } from 'node:child_process'

export function installDependencies(root: string): void {
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: root, stdio: ['ignore', 2, 2] })
}
