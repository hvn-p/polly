import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { down } from '../src/commands/down.ts'
import { up } from '../src/commands/up.ts'
import { parseEnv } from '../src/config/index.ts'
import { fakeInfrastructure } from './support/fake-infrastructure.ts'
import { git, temporaryRepository } from './support/repository.ts'

const out = () => undefined

describe('dev:down with faked infrastructure', () => {
  it('stops the processes, then releases the databases, the bucket and the route', async () => {
    const root = temporaryRepository('feature/probe')
    const infra = fakeInfrastructure()
    await up({ root, infra, out })
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
    ])
    expect(existsSync(join(root, '.dev/state.json'))).toBe(false)
  })

  it('C13: after a branch rename, releases the resources recorded at the first dev:up', async () => {
    const root = temporaryRepository('feature/before')
    const infra = fakeInfrastructure()
    await up({ root, infra, out })
    const id = parseEnv(readFileSync(join(root, '.env.local'), 'utf8')).get('POLLY_WORKTREE_ID') ?? ''
    git(root, 'branch', '--move', 'feature/after')
    infra.calls.length = 0
    await down({ root, infra, out })
    expect(id).toMatch(/^feature-before-/)
    expect(infra.calls).toContain(`garage.release polly-${id}`)
    expect(infra.calls).toContain(`routes.remove ${id}.polly`)
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
    await up({ root, infra, out })
    const holder = spawn('flock', [join(root, '.dev/up.lock'), 'sh', '-c', 'echo held; sleep 1'])
    await new Promise((resolve) => holder.stdout.once('data', resolve))
    const released = new Promise<number>((resolve) => holder.once('exit', () => resolve(Date.now())))
    infra.calls.length = 0
    let firstCall = 0
    const ensureRunning = infra.shared.ensureRunning
    infra.shared.ensureRunning = async () => {
      firstCall = Date.now()
      await ensureRunning()
    }
    await down({ root, infra, out })
    expect(firstCall).toBeGreaterThanOrEqual(await released)
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
    await expect(up({ root, infra, out })).rejects.toThrow('garage down')
    expect(existsSync(join(root, '.dev/state.json'))).toBe(false)
    infra.calls.length = 0
    await down({ root, infra, out })
    expect(infra.calls).toEqual([
      'shared.ensureRunning',
      expect.stringMatching(/^postgres\.release /),
      expect.stringMatching(/^garage\.release /),
      expect.stringMatching(/^routes\.remove /),
    ])
  })
})

describe('dev:down and the bucket key', () => {
  it('forgets the deleted key, which Garage never lets exist again, and keeps every other value', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    await up({ root, infra, out })
    const before = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
    await down({ root, infra, out })
    const after = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
    expect(after.has('S3_ACCESS_KEY_ID')).toBe(false)
    expect(after.has('S3_SECRET_ACCESS_KEY')).toBe(false)
    for (const [key, value] of after) {
      expect(before.get(key)).toBe(value)
    }
    await up({ root, infra, out })
    const again = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'))
    expect(again.get('S3_ACCESS_KEY_ID')).not.toBe(before.get('S3_ACCESS_KEY_ID'))
    expect(again.get('BETTER_AUTH_SECRET')).toBe(before.get('BETTER_AUTH_SECRET'))
  })
})
