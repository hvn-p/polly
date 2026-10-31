import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SupervisedProcess } from '../src/ports/index.ts'
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
    await until(() => groupMembers(state.pid).length === 1)
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

  it('launches nothing once stopping, even a process waiting for its restart', async () => {
    const root = mkdtempSync(join(tmpdir(), 'supervisor-'))
    const started = join(root, 'started')
    const state = await supervisor.start({
      root,
      processes: [
        // Crashes on its first run, lives on the next: a restart would keep it.
        {
          name: 'flaky',
          command: process.execPath,
          args: [
            '-e',
            `const fs = require('node:fs'); fs.appendFileSync(${JSON.stringify(started)}, 'run\\n');
             if (fs.readFileSync(${JSON.stringify(started)}, 'utf8').length === 4) process.exit(1);
             setInterval(() => {}, 1000)`,
          ],
          cwd: root,
        },
        // Takes longer to stop than the restart delay.
        {
          name: 'slow',
          command: process.execPath,
          args: [
            '-e',
            "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 3000)); setInterval(() => {}, 1000)",
          ],
          cwd: root,
        },
      ],
      env: {},
    })
    try {
      await until(() => existsSync(started) && groupMembers(state.pid).length === 2)
      process.kill(state.pid, 'SIGTERM')
      await until(() => !supervisor.isRunning(state), 8000)
      expect(readFileSync(started, 'utf8')).toBe('run\n')
    } finally {
      await supervisor.stop(state)
    }
  })

  it('kills, after its grace period, a process that ignores SIGTERM', async () => {
    const root = mkdtempSync(join(tmpdir(), 'supervisor-'))
    const stubborn = processSupervisor({ graceMs: 200 })
    const state = await stubborn.start({
      root,
      processes: [
        {
          name: 'stubborn',
          command: 'sh',
          args: ['-c', "trap '' TERM; while :; do sleep 0.05; done"],
          cwd: root,
        },
      ],
      env: {},
    })
    await until(() => groupMembers(state.pid).length >= 2)
    await stubborn.stop(state)
    expect(groupMembers(state.pid)).toEqual([])
  })

  it('does not take a reused PID for its supervisor', () => {
    expect(supervisor.isRunning({ pid: process.pid })).toBe(false)
  })

  it('C18: leaves alone a foreign group whose leader reused the recorded PID', async () => {
    const foreign = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
    const pid = foreign.pid ?? 0
    try {
      await supervisor.stop({ pid })
      expect(groupMembers(pid)).toEqual([pid])
    } finally {
      process.kill(-pid, 'SIGKILL')
    }
  })

  it('C18: leaves alone a foreign group orphaned by its leader under the recorded PID', async () => {
    const leader = spawn('sh', ['-c', 'sleep 30 & echo $!'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pid = leader.pid ?? 0
    const [member] = (await once(leader.stdout, 'data')) as [Buffer]
    await once(leader, 'exit')
    await until(() => groupMembers(pid).length === 1)
    try {
      await supervisor.stop({ pid })
      expect(groupMembers(pid)).toEqual([Number(member.toString())])
    } finally {
      process.kill(-pid, 'SIGKILL')
    }
  })
})
