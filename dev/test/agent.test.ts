import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agent, type Launch } from '../src/commands/agent.ts'
import { up } from '../src/commands/up.ts'
import { parseEnv } from '../src/config/index.ts'
import { fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
import { temporaryRepository } from './support/repository.ts'

function recorder() {
  const launches: { command: string; args: readonly string[]; env: NodeJS.ProcessEnv }[] = []
  const launch: Launch = async (command, args, env) => {
    launches.push({ command, args, env })
    return 0
  }
  return { launches, launch }
}

const codeRoot = join(import.meta.dirname, '..', '..')

describe('nr agent', () => {
  it("starts Claude Code with the worktree's plugin and its URLs", async () => {
    const root = temporaryRepository()
    await up({ root, ...loaded(fakeInfrastructure()), out: () => undefined })
    const env = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
    const { launches, launch } = recorder()
    const lines: string[] = []
    expect(
      await agent({ root, args: ['--resume'], out: (line) => lines.push(line), launch, baseEnv: {} }),
    ).toBe(0)
    expect(launches).toEqual([
      {
        command: 'claude',
        args: ['--plugin-dir', join(codeRoot, 'plugin'), '--resume'],
        env: { POLLY_MCP_URL: env.get('POLLY_MCP_URL'), POLLY_EVENTS_URL: env.get('POLLY_EVENTS_URL') },
      },
    ])
    expect(lines).toEqual([])
  })

  it('C28: without configuration, says so and exports nothing, even what the parent session had', async () => {
    const { launches, launch } = recorder()
    const lines: string[] = []
    const baseEnv = {
      POLLY_MCP_URL: 'https://other.polly.localhost/mcp',
      POLLY_EVENTS_URL: 'x',
      HOME: '/home/x',
    }
    await agent({ root: temporaryRepository(), args: [], out: (line) => lines.push(line), launch, baseEnv })
    expect(lines).toEqual([expect.stringMatching(/^WORKTREE_NOT_CONFIGURED: /)])
    expect(launches[0]?.env).toEqual({ HOME: '/home/x' })
  })
})
