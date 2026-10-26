import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

// A temporary git repository with one commit, on the given branch.
export function temporaryRepository(branch = 'feature/probe'): string {
  const root = mkdtempSync(join(tmpdir(), 'polly-dev-'))
  git(root, 'init', '--quiet', '--initial-branch', branch)
  git(
    root,
    '-c',
    'user.name=test',
    '-c',
    'user.email=test@polly.localhost',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'init',
  )
  return root
}
