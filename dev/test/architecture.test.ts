import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { architecture } from '../src/commands/architecture.ts'
import { up } from '../src/commands/up.ts'
import { fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
import { holdLock } from './support/lock-holder.ts'
import { temporaryRepository } from './support/repository.ts'

function output() {
  const lines: string[] = []
  return { lines, write: (line: string) => lines.push(line) }
}

async function running() {
  const root = temporaryRepository()
  const infra = fakeInfrastructure()
  await up({ root, ...loaded(infra), out: () => undefined, warn: () => undefined })
  const id = readFileSync(join(root, '.env.local'), 'utf8').match(/^POLLY_WORKTREE_ID=(.*)$/m)?.[1] ?? ''
  infra.calls.length = 0
  return { root, infra, id }
}

describe('dev:architecture', () => {
  it("C80: source restarts the view's project from the worktree's sources and prints its URL", async () => {
    const { root, infra, id } = await running()
    const out = output()
    await architecture({ root, infra, from: 'source', out: out.write, warn: out.write })
    expect(infra.calls).toEqual([`architecture.start polly-${id}-architecture source`])
    expect(out.lines).toEqual([`architecture view: https://arch.${id}.polly.localhost`])
  })

  it('C80: package goes back to the pinned version, and says when it holds no view', async () => {
    const { root, infra, id } = await running()
    infra.viewAvailable = false
    const out = output()
    await architecture({ root, infra, from: 'package', out: out.write, warn: out.write })
    expect(infra.calls).toEqual([`architecture.start polly-${id}-architecture package`])
    expect(out.lines).toEqual([
      expect.stringMatching(/^ARCHITECTURE_VIEW_UNAVAILABLE: .*nr dev:architecture source/),
    ])
  })

  it('C80: refuses another source, starting nothing', async () => {
    const { root, infra } = await running()
    await expect(
      architecture({ root, infra, from: 'local', out: () => undefined, warn: () => undefined }),
    ).rejects.toMatchObject({
      code: 'UNKNOWN_ARCHITECTURE_SOURCE',
      message: expect.stringContaining('source, package'),
    })
    expect(infra.calls).toEqual([])
  })

  it('C80: in a worktree never brought up, refuses WORKTREE_NOT_CONFIGURED, starting nothing', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await expect(
      architecture({ root, infra, from: 'source', out: () => undefined, warn: () => undefined }),
    ).rejects.toMatchObject({ code: 'WORKTREE_NOT_CONFIGURED' })
    expect(infra.calls).toEqual([])
  })

  it('waits for a dev:up running in the same worktree', async () => {
    const { root, infra } = await running()
    await holdLock(join(root, '.dev/up.lock'), 1)
    const heldAt = Date.now()
    await architecture({ root, infra, from: 'source', out: () => undefined, warn: () => undefined })
    expect(Date.now() - heldAt).toBeGreaterThanOrEqual(900)
  })
})
