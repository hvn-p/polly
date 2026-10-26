import { Refusal } from './refusal.ts'
import { readEnv, required } from './state.ts'
import { worktreeAt } from './worktree.ts'

// dev:url: the worktree's URL, from its configuration.
export function url({ root, out }: { root: string; out: (line: string) => void }): void {
  const env = readEnv(worktreeAt(root))
  if (env === undefined) {
    throw new Refusal('WORKTREE_NOT_CONFIGURED', 'this worktree has no .env.local; run nr dev:up')
  }
  out(required(env, 'PUBLIC_URL'))
}
