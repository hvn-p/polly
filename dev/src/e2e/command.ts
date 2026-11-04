// A command whose failure ends the step that ran it: it resolves with what it
// printed on stdout, and rejects naming the command, with what it printed.

import { execFile } from 'node:child_process'

export function checked(
  command: string,
  args: readonly string[],
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { env, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout)
      } else {
        reject(new Error(`${name} failed: ${`${stdout}${stderr}`.trim() || error.message}`))
      }
    })
  })
}
