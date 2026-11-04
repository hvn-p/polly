// Whether Claude Code, which an end-to-end run drives, is installed and
// signed in, and whether the tools the driver needs are there.

import { execFile } from 'node:child_process'

export interface ClientStatus {
  installed: boolean
  signedIn: boolean
}

export function probeClaude(env: NodeJS.ProcessEnv = process.env): Promise<ClientStatus> {
  return new Promise((resolve) => {
    execFile('claude', ['auth', 'status'], { env, encoding: 'utf8' }, (error, stdout) => {
      if (error !== null && error.code === 'ENOENT') {
        resolve({ installed: false, signedIn: false })
      } else {
        resolve({ installed: true, signedIn: /"loggedIn":\s*true/.test(stdout) })
      }
    })
  })
}

const DRIVER_TOOLS = [
  // Gives Claude Code the pseudo-terminal its plugin monitors need.
  { name: 'script (util-linux)', command: 'script' },
]

// The first tool the driver needs that does not answer; undefined when all do.
export async function probeDriverTools(env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  for (const tool of DRIVER_TOOLS) {
    const answers = await new Promise<boolean>((resolve) => {
      execFile(tool.command, ['--version'], { env }, (error) => resolve(error === null))
    })
    if (!answers) {
      return tool.name
    }
  }
  return undefined
}
