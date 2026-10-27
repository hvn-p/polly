// The Claude Code session an end-to-end run drives: the one nr agent starts,
// without the markers of a Claude Code session the run was started from
// (inherited, they make the driven session a child that keeps no transcript).

import { Refusal } from '../kernel/index.ts'
import { agentSession, type Session } from '../worktree/index.ts'

export function drivenSession(root: string, args: readonly string[], baseEnv = process.env): Session {
  const inherited = Object.entries(baseEnv).filter(
    ([key]) => !(key === 'CLAUDECODE' || key === 'CLAUDE_PID' || /^CLAUDE_CODE_(?!ENABLE_)/.test(key)),
  )
  const session = agentSession(root, args, Object.fromEntries(inherited))
  if (!session.configured) {
    throw new Refusal('WORKTREE_NOT_CONFIGURED', 'this worktree has no .env.local; run nr dev:up')
  }
  return session
}
