import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lock, tryLock } from '../src/machine/lock.ts'
import { holdLock } from './support/lock-holder.ts'

const lockFile = () => join(mkdtempSync(join(tmpdir(), 'lock-')), 'nested', 'test.lock')

describe('lock', { timeout: 30_000 }, () => {
  it('is refused while another process holds it, and taken as soon as its holder is killed', async () => {
    const path = lockFile()
    const holder = await holdLock(path)
    expect(await tryLock(path)).toBeUndefined()
    holder.kill('SIGKILL')
    await once(holder, 'exit')
    const held = await tryLock(path)
    expect(held).toBeDefined()
    await held?.release()
  })

  it('waits for its holder to release it', async () => {
    const path = lockFile()
    const holder = await holdLock(path, 1)
    const released = once(holder, 'exit').then(() => Date.now())
    const held = await lock(path)
    expect(Date.now()).toBeGreaterThanOrEqual(await released)
    await held.release()
  })

  it('excludes a second holder in the same process until released', async () => {
    const path = lockFile()
    const first = await lock(path)
    expect(await tryLock(path)).toBeUndefined()
    await first.release()
    const second = await tryLock(path)
    expect(second).toBeDefined()
    await second?.release()
  })
})
