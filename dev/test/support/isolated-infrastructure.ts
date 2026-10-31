import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type ComposeInfrastructure,
  type ComposeSettings,
  composeInfrastructure,
} from '../../src/infra/compose.ts'

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  return typeof address === 'object' && address !== null ? address.port : 0
}

// A compose project of the test's own, never the shared polly-dev: stopping or
// removing it touches no worktree, and two test runs never share one.
export async function isolatedInfrastructure(): Promise<
  ComposeInfrastructure & { settings: ComposeSettings; destroy: () => void }
> {
  const project = `polly-dev-test-${randomBytes(3).toString('hex')}`
  const settings: ComposeSettings = {
    project,
    postgresPort: await freePort(),
    garagePort: await freePort(),
    machineDirectory: mkdtempSync(join(tmpdir(), `${project}-`)),
  }
  const compose = composeInfrastructure(settings)
  return {
    ...compose,
    settings,
    destroy: () => {
      execFileSync('docker', ['compose', '-p', project, 'down', '--volumes', '--timeout', '1'], {
        stdio: 'ignore',
      })
    },
  }
}

export function containerIds(project: string): string {
  return execFileSync('docker', ['compose', '-p', project, 'ps', '-q'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .sort()
    .join(',')
}
