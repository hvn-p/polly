// Whether Claude Code, which an end-to-end run drives, is installed and
// signed in.

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
