// The Claude Code session of a worktree: its plugin, pointed at its server.
// Without a configuration, the plugin keeps its invalid default address: a
// URL inherited from another session is never passed on.

import { join } from 'node:path'
import { readEnv } from './state.ts'
import { worktreeAt } from './worktree.ts'

const pluginDirectory = join(import.meta.dirname, '..', '..', '..', 'plugin')
const URL_KEYS = ['POLLY_MCP_URL', 'POLLY_EVENTS_URL'] as const

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
