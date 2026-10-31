// The worktree's URL: a static portless route from <identity>.polly.localhost
// to the front-end dev server. portless overwrites a route silently, so the
// commands read the table before adding one.

import { PORTLESS } from '../machine/index.ts'
import type { RouteTable } from '../ports/index.ts'
import { run } from './compose.ts'

const ROUTE = /^\s*https:\/\/(\S+)\.localhost\s+->\s+\S+:(\d+)/

// portless refuses to run when it believes it was started by `pnpm exec` or
// `npx`, which these variables signal when a command runs under pnpm.
export function portless(args: readonly string[], executable = PORTLESS): Promise<string> {
  const { npm_command: _command, PNPM_SCRIPT_SRC_DIR: _source, ...env } = process.env
  return run(executable, args, { env })
}

export function portlessRoutes(executable = PORTLESS): RouteTable {
  return {
    portOf: async (name) => {
      for (const line of (await portless(['list'], executable)).split('\n')) {
        const match = ROUTE.exec(line)
        if (match?.[1] === name) {
          return Number(match[2])
        }
      }
      return undefined
    },
    add: async (name, port) => {
      await portless(['alias', name, String(port)], executable)
    },
    remove: async (name) => {
      try {
        await portless(['alias', '--remove', name], executable)
      } catch (error) {
        if (!(error instanceof Error && error.message.includes('No alias found'))) {
          throw error
        }
      }
    },
  }
}
