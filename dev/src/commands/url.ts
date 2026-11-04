import { Refusal } from '@polly/platform'
import { readEnv, required, worktreeAt } from '../worktree/index.ts'

// dev:url: the worktree's URL, from its configuration.
export function url({ root, out }: { root: string; out: (line: string) => void }): void {
  const env = readEnv(worktreeAt(root))
  if (env === undefined) {
    throw new Refusal('WORKTREE_NOT_CONFIGURED', 'this worktree has no .env.local; run nr dev:up')
  }
  out(required(env, 'PUBLIC_URL'))
}
