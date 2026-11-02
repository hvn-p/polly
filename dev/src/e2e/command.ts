// A command whose failure ends the step that ran it: it rejects naming the
// command, with what it printed.

import { execFile } from 'node:child_process'

export function checked(command: string, args: readonly string[], name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`
      if (error === null) {
        resolve(output)
      } else {
        reject(new Error(`${name} failed: ${output.trim() || error.message}`))
      }
    })
  })
}
