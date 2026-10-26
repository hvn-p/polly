import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SupervisedProcess } from '../src/infra/ports.ts'
import { groupMembers, processSupervisor } from '../src/supervisor/index.ts'
import { until } from './support/until.ts'

function ticker(name: string, root: string): SupervisedProcess {
  return {
    name,
    command: process.execPath,
    args: ['-e', `console.log('${name} ' + process.env.MARK); setInterval(() => {}, 1000)`],
    cwd: root,
  }
}

describe('process supervisor', { timeout: 30_000 }, () => {
  const supervisor = processSupervisor()

  it('runs every process detached in one group, with its log and the worktree env', async () => {
    const root = mkdtempSync(join(tmpdir(), 'supervisor-'))
    const state = await supervisor.start({
      root,
      processes: [ticker('api', root), ticker('web', root)],
      env: { MARK: 'from-env' },
    })
    try {
      expect(supervisor.isRunning(state)).toBe(true)
      await until(() => groupMembers(state.pid).length === 3)
      await until(() => existsSync(join(root, '.dev/logs/web.log')))
      await until(() => readFileSync(join(root, '.dev/logs/api.log'), 'utf8').includes('api from-env'))
    } finally {
      await supervisor.stop(state)
    }
    expect(groupMembers(state.pid)).toEqual([])
    expect(supervisor.isRunning(state)).toBe(false)
  })

  it('C3, C15: stops every process even when the supervisor was killed; stopping again changes nothing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'supervisor-'))
    const state = await supervisor.start({ root, processes: [ticker('api', root)], env: {} })
    await until(() => groupMembers(state.pid).length === 2)
    process.kill(state.pid, 'SIGKILL')
    await until(() => !supervisor.isRunning(state))
    expect(groupMembers(state.pid)).toHaveLength(1)
    await supervisor.stop(state)
    expect(groupMembers(state.pid)).toEqual([])
    await expect(supervisor.stop(state)).resolves.toBeUndefined()
  })

  it('restarts a process that exits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'supervisor-'))
    const state = await supervisor.start({ root, processes: [ticker('api', root)], env: {} })
    try {
      await until(() => groupMembers(state.pid).length === 2)
      const [child] = groupMembers(state.pid).filter((pid) => pid !== state.pid)
      process.kill(child ?? 0, 'SIGKILL')
      await until(
        () => groupMembers(state.pid).filter((pid) => pid !== state.pid && pid !== child).length === 1,
      )
    } finally {
      await supervisor.stop(state)
    }
  })

  it('does not take a reused PID for its supervisor', () => {
    expect(supervisor.isRunning({ pid: process.pid })).toBe(false)
  })
})
