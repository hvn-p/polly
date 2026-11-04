// A worktree's architecture view, run by the analyzer's own command
// (tools/architecture/dev/serve.ts) as a Compose project of its own: from the
// version of @hvn-p/architecture the repository pins, or from the worktree's
// sources (research R19).

import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Refusal } from '@polly/platform'
import type { ArchitectureView } from '../ports/index.ts'

export interface ArchitectureSettings {
  // The checkout the analyzer's sources and command come from.
  codeRoot: string
  // Put before the identity to name a project: polly- on the machine.
  prefix?: string
}

export function architectureView({ codeRoot, prefix = 'polly-' }: ArchitectureSettings): ArchitectureView {
  const tool = join(codeRoot, 'tools/architecture')
  // Runs serve.ts; its refusal, `<CODE>: <message>`, becomes a Refusal.
  const serve = (args: readonly string[]) =>
    new Promise<void>((resolve, reject) => {
      execFile(
        process.execPath,
        [join(tool, 'dev/serve.ts'), ...args],
        { encoding: 'utf8' },
        (error, _, stderr) => {
          if (error === null) {
            resolve()
            return
          }
          const refusal = /^([A-Z_]+): (.*)$/m.exec(stderr)
          reject(
            refusal === null
              ? new Error(`the architecture view's ${args[0]} failed: ${stderr.trim() || error.message}`)
              : new Refusal(refusal[1] ?? '', refusal[2] ?? ''),
          )
        },
      )
    })
  const pinned = () =>
    (
      JSON.parse(readFileSync(join(codeRoot, 'package.json'), 'utf8')) as {
        devDependencies: Record<string, string>
      }
    ).devDependencies['@hvn-p/architecture'] ?? ''

  return {
    projectOf: (identity) => `${prefix}${identity}-architecture`,
    start: async (name, { root, port, host, from }) => {
      try {
        await serve([
          'up',
          ...['--project', name, '--root', root, '--port', String(port), '--allow-host', host],
          ...['--logs', join(root, '.dev', 'logs')],
          ...(from === 'source' ? ['--source', tool] : ['--version', pinned()]),
        ])
        return 'served'
      } catch (error) {
        if (error instanceof Refusal && error.code === 'ARCHITECTURE_VIEW_UNAVAILABLE') {
          return 'unavailable'
        }
        throw error
      }
    },
    stop: (name) => serve(['down', '--project', name]),
  }
}
