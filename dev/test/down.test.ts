import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { down } from '../src/commands/down.ts'
import { up } from '../src/commands/up.ts'
import { parseEnv } from '../src/config/index.ts'
import { fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
import { holdLock } from './support/lock-holder.ts'
import { git, temporaryRepository } from './support/repository.ts'

const out = () => undefined

describe('dev:down with faked infrastructure', () => {
  it('stops the processes, then releases the databases, the bucket and the route', async () => {
    const root = temporaryRepository('feature/probe')
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out, warn: out })
    const env = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
    const id = env.get('POLLY_WORKTREE_ID') ?? ''
    infra.calls.length = 0
    await down({ root, infra, out })
    expect(infra.calls).toEqual([
      'shared.ensureRunning',
      expect.stringMatching(/^supervisor\.stop \d+$/),
      `postgres.release polly_${id.replaceAll('-', '_')}`,
      `garage.release polly-${id}`,
      `routes.remove ${id}.polly`,
      `routes.remove arch.${id}.polly`,
    ])
    expect(existsSync(join(root, '.dev/state.json'))).toBe(false)
  })

  it('C13: after a branch rename, releases the resources recorded at the first dev:up', async () => {
    const root = temporaryRepository('feature/before')
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out, warn: out })
    const id = parseEnv(readFileSync(join(root, '.env.local'), 'utf8')).get('POLLY_WORKTREE_ID') ?? ''
    git(root, 'branch', '--move', 'feature/after')
    infra.calls.length = 0
    await down({ root, infra, out })
    expect(id).toMatch(/^feature-before-/)
    expect(infra.calls).toContain(`postgres.release polly_${id.replaceAll('-', '_')}`)
    expect(infra.calls).toContain(`garage.release polly-${id}`)
    expect(infra.calls).toContain(`routes.remove ${id}.polly`)
    expect(infra.calls).toContain(`routes.remove arch.${id}.polly`)
  })

  it('C16: on a worktree already released, or never set up, changes nothing', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await down({ root, infra, out })
    expect(infra.calls).toEqual([])
  })

  it('C62: started while dev:up holds the worktree lock, waits for it, then releases', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out, warn: out })
    await holdLock(join(root, '.dev/up.lock'), 1)
    const heldAt = Date.now()
    infra.calls.length = 0
    let firstCall = 0
    const ensureRunning = infra.shared.ensureRunning
    infra.shared.ensureRunning = async () => {
      firstCall = Date.now()
      await ensureRunning()
    }
    await down({ root, infra, out })
    // The lock is released when the holder's sleep ends, which Node may notice after dev:down does.
    expect(firstCall - heldAt).toBeGreaterThan(900)
    expect(infra.calls.at(-1)).toMatch(/^routes\.remove /)
  })
})

describe('dev:down after a dev:up that failed midway', () => {
  it('still releases what the configuration names', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    infra.garage.ensure = async () => {
      throw new Error('garage down')
    }
    await expect(up({ root, ...loaded(infra), out, warn: out })).rejects.toThrow('garage down')
    expect(existsSync(join(root, '.dev/state.json'))).toBe(false)
    infra.calls.length = 0
    await down({ root, infra, out })
    expect(infra.calls).toEqual([
      'shared.ensureRunning',
      expect.stringMatching(/^postgres\.release /),
      expect.stringMatching(/^garage\.release /),
      expect.stringMatching(/^routes\.remove /),
      expect.stringMatching(/^routes\.remove arch\./),
    ])
  })
})

describe('dev:down and the bucket key', () => {
  it('forgets the deleted key, which Garage never lets exist again, and keeps every other value', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, ...loaded(infra), out, warn: out })
    const before = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
    await down({ root, infra, out })
    const after = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
    expect(after.has('S3_ACCESS_KEY_ID')).toBe(false)
    expect(after.has('S3_SECRET_ACCESS_KEY')).toBe(false)
    for (const [key, value] of after) {
      expect(before.get(key)).toBe(value)
    }
    await up({ root, ...loaded(infra), out, warn: out })
    const again = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
    expect(again.get('S3_ACCESS_KEY_ID')).not.toBe(before.get('S3_ACCESS_KEY_ID'))
    expect(again.get('BETTER_AUTH_SECRET')).toBe(before.get('BETTER_AUTH_SECRET'))
  })
})
