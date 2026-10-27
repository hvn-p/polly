// nr agent: starts Claude Code with this worktree's plugin, pointed at this
// worktree's server. Without a configuration, the plugin keeps its invalid
// default address: a URL inherited from another session is never passed on.

import { spawn } from 'node:child_process'
import { agentSession } from '../worktree/index.ts'

export type Launch = (command: string, args: readonly string[], env: NodeJS.ProcessEnv) => Promise<number>

export const launchInteractive: Launch = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })

export async function agent({
  root,
  args,
  out,
  launch = launchInteractive,
  baseEnv = process.env,
}: {
  root: string
  args: readonly string[]
  out: (line: string) => void
  launch?: Launch
  baseEnv?: NodeJS.ProcessEnv
}): Promise<number> {
  const session = agentSession(root, args, baseEnv)
  if (!session.configured) {
    out('WORKTREE_NOT_CONFIGURED: this worktree has no .env.local; run nr dev:up, then nr agent again')
  }
  return launch(session.command, session.args, session.env)
}
