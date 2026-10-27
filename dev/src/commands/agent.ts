// nr agent: starts Claude Code with this worktree's plugin, pointed at this
// worktree's server. Without a configuration, the plugin keeps its invalid
// default address: a URL inherited from another session is never passed on.

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { readEnv } from './state.ts'
import { worktreeAt } from './worktree.ts'

const pluginDirectory = join(import.meta.dirname, '..', '..', '..', 'plugin')
const URL_KEYS = ['POLLY_MCP_URL', 'POLLY_EVENTS_URL'] as const

export type Launch = (command: string, args: readonly string[], env: NodeJS.ProcessEnv) => Promise<number>

export const launchInteractive: Launch = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })

export interface Session {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  // Whether the worktree has a configuration: without one, the plugin keeps
  // its invalid default address.
  configured: boolean
}

// The Claude Code session of this worktree: its plugin, and its URLs from its
// configuration, never ones inherited from the parent environment.
export function agentSession(root: string, args: readonly string[], baseEnv: NodeJS.ProcessEnv): Session {
  const env = { ...baseEnv }
  for (const key of URL_KEYS) {
    delete env[key]
  }
  const configuration = readEnv(worktreeAt(root))
  for (const key of URL_KEYS) {
    const value = configuration?.[key]
    if (value !== undefined) {
      env[key] = value
    }
  }
  return {
    command: 'claude',
    args: ['--plugin-dir', pluginDirectory, ...args],
    env,
    configured: configuration !== undefined,
  }
}

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
