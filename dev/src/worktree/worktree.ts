// The worktree a command runs in: its root, its branch, and where its
// generated configuration and runtime state live.

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { Refusal } from '@polly/platform'

export interface Worktree {
  root: string
  envFile: string
  stateDirectory: string
  stateFile: string
  upLock: string
}

export function worktreeAt(root: string): Worktree {
  const stateDirectory = join(root, '.dev')
  return {
    root,
    envFile: join(root, '.env.local'),
    stateDirectory,
    stateFile: join(stateDirectory, 'state.json'),
    upLock: join(stateDirectory, 'up.lock'),
  }
}

export function currentBranch(root: string): string {
  try {
    return execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    throw new Refusal('DETACHED_HEAD', 'this checkout has no branch; switch to one, then run nr dev:up')
  }
}
