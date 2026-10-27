import { describe, expect, it } from 'vitest'
import { e2e } from '../src/commands/e2e.ts'
import { up } from '../src/commands/up.ts'
import { fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
import { temporaryRepository } from './support/repository.ts'

const out = () => undefined

describe('nr dev:e2e refusals', () => {
  it('C39: refuses when Claude Code is missing or signed out', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out })
    for (const client of [
      { installed: false, signedIn: false },
      { installed: true, signedIn: false },
    ]) {
      await expect(
        e2e({ root, infra, scenario: 'smoke', out, client: async () => client }),
      ).rejects.toMatchObject({ code: 'E2E_CLIENT_UNAVAILABLE' })
    }
  })

  it('C40: refuses a worktree whose Polly is not running, naming nr dev:up', async () => {
    const client = async () => ({ installed: true, signedIn: true })
    await expect(
      e2e({ root: temporaryRepository(), infra: fakeInfrastructure(), scenario: 'smoke', out, client }),
    ).rejects.toMatchObject({
      code: 'WORKTREE_NOT_RUNNING',
      message: expect.stringContaining('nr dev:up'),
    })
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out })
    infra.runningSupervisors.clear()
    await expect(e2e({ root, infra, scenario: 'smoke', out, client })).rejects.toMatchObject({
      code: 'WORKTREE_NOT_RUNNING',
    })
  })

  it('refuses an unknown scenario', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out })
    await expect(
      e2e({ root, infra, scenario: 'nope', out, client: async () => ({ installed: true, signedIn: true }) }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_SCENARIO' })
  })
})

describe('nr dev:e2e outcome', () => {
  const client = async () => ({ installed: true, signedIn: true })
  const tools = async () => undefined

  it('refuses when a tool the driver needs is missing, naming it, and drives nothing', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out })
    let driven = false
    const driver = async () => {
      driven = true
      return { failures: [], transcript: '' }
    }
    await expect(
      e2e({ root, infra, scenario: 'smoke', out, client, tools: async () => 'agent-browser', driver }),
    ).rejects.toMatchObject({
      code: 'MISSING_PREREQUISITE',
      message: expect.stringContaining('agent-browser'),
    })
    expect(driven).toBe(false)
  })

  it('C38: prints pass and the transcript path', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out })
    const lines: string[] = []
    const driver = async () => ({ failures: [], transcript: '/tmp/session.jsonl' })
    await e2e({ root, infra, scenario: 'smoke', out: (line) => lines.push(line), client, tools, driver })
    expect(lines).toEqual(['transcript: /tmp/session.jsonl', 'PASS smoke'])
  })

  it('C38: fails with what the transcript misses', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out })
    const driver = async () => ({ failures: ['whoami was not called'], transcript: '/tmp/session.jsonl' })
    await expect(e2e({ root, infra, scenario: 'smoke', out, client, tools, driver })).rejects.toMatchObject({
      code: 'E2E_FAILED',
      message: 'smoke: whoami was not called',
    })
  })
})
