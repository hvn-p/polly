// The tools dev:up needs on the machine, checked before it changes anything.

import { execFile } from 'node:child_process'
import type { Prerequisites } from '../ports/index.ts'
import { PORTLESS } from './tools.ts'

export type Exec = (command: string, args: readonly string[]) => Promise<{ ok: boolean; output: string }>

// portless refuses to run under `pnpm exec`, which these variables signal.
const { npm_command: _command, PNPM_SCRIPT_SRC_DIR: _source, ...toolEnv } = process.env

const execTool: Exec = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8', env: toolEnv }, (error, stdout, stderr) =>
      resolve({ ok: error === null, output: `${stdout}${stderr}` }),
    )
  })

// What the machine provides besides Node 24; every other tool is a project
// dependency, and pnpm comes through Corepack (research R21).
const TOOLS: { name: string; command: string; args: string[] }[] = [
  { name: 'docker', command: 'docker', args: ['--version'] },
  { name: 'docker compose', command: 'docker', args: ['compose', 'version'] },
]

export async function probePrerequisites({
  exec = execTool,
  nodeVersion = process.versions.node,
}: {
  exec?: Exec
  nodeVersion?: string
} = {}): Promise<string | undefined> {
  if (Number(nodeVersion.split('.')[0]) < 24) {
    return 'Node 24'
  }
  for (const tool of TOOLS) {
    if (!(await exec(tool.command, tool.args)).ok) {
      return tool.name
    }
  }
  // The proxy binds 443 and trusts its local CA: the one machine-level step.
  const doctor = await exec(PORTLESS, ['doctor'])
  if (!/ok\s+Proxy is responding/.test(doctor.output) && !/^Proxy is responding/m.test(doctor.output)) {
    return 'the portless proxy (portless proxy start)'
  }
  return undefined
}

export const prerequisites: Prerequisites = { missing: () => probePrerequisites() }
