import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { up } from '../src/commands/up.ts'
import { drivenSession } from '../src/e2e/session.ts'
import { agentSession } from '../src/worktree/index.ts'
import { fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
import { temporaryRepository } from './support/repository.ts'

const plugin = join(import.meta.dirname, '..', '..', 'plugin')

describe('driven session', () => {
  it("C27: is the launcher's session, with the run's arguments after the launcher's", async () => {
    const root = temporaryRepository()
    await up({ root, ...loaded(fakeInfrastructure()), out: () => undefined, warn: () => undefined })
    const baseEnv = { HOME: '/home/x', CLAUDECODE: '1', CLAUDE_CODE_SSE_PORT: '1', CLAUDE_CODE_ENABLE_X: '1' }
    const launcher = agentSession(root, ['mcp', 'list'], { HOME: '/home/x', CLAUDE_CODE_ENABLE_X: '1' })
    const driven = drivenSession(root, ['mcp', 'list'], baseEnv)
    expect(driven).toEqual(launcher)
    expect(driven.args).toEqual(['--plugin-dir', plugin, 'mcp', 'list'])
    expect(driven.env['POLLY_MCP_URL']).toMatch(/^https:\/\/.*\.polly\.localhost\/mcp$/)
  })

  it('refuses to drive a worktree with no configuration', () => {
    expect(() => drivenSession(temporaryRepository(), [], {})).toThrow(
      expect.objectContaining({ code: 'WORKTREE_NOT_CONFIGURED' }),
    )
  })
})
