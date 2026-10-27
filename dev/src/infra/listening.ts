// Who listens on a TCP port, read with `ss`.

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { PortTable } from '../ports/index.ts'
import { run } from './compose.ts'

export function listeningPorts(): PortTable {
  return {
    holderOf: async (port) => {
      const line = (await run('ss', ['-Hltnp', `sport = :${port}`])).trim().split('\n')[0] ?? ''
      if (line === '') {
        return undefined
      }
      const holder = /users:\(\("([^"]+)",pid=(\d+)/.exec(line)
      if (holder === null) {
        return 'a process of another user'
      }
      // ss shows the thread's name; the command line names the program.
      let program = holder[1]
      try {
        program = basename(readFileSync(`/proc/${holder[2]}/cmdline`, 'utf8').split('\0')[0] ?? '') || program
      } catch {}
      return `${program} (pid ${holder[2]})`
    },
  }
}
