import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { up } from '../src/commands/up.ts'
import { probePrerequisites } from '../src/machine/prerequisites.ts'
import { run } from '../src/main.ts'
import { fakeInfrastructure, loaded } from './support/fake-infrastructure.ts'
import { git, temporaryRepository } from './support/repository.ts'

function output() {
  const lines: string[] = []
  return { lines, write: (line: string) => lines.push(line) }
}

describe('command frame', () => {
  it('C5: refuses a checkout with no branch, and changes nothing', async () => {
    const root = temporaryRepository()
    git(root, 'checkout', '--quiet', '--detach')
    const infra = fakeInfrastructure()
    await expect(up({ root, ...loaded(infra), out: output().write })).rejects.toMatchObject({
      code: 'DETACHED_HEAD',
    })
    expect(infra.calls).toEqual([])
  })

  it('C6: refuses when a prerequisite is missing, naming it, and changes nothing', async () => {
    const root = temporaryRepository()
    const infra = fakeInfrastructure()
    infra.missingPrerequisite = 'flock'
    await expect(up({ root, ...loaded(infra), out: output().write })).rejects.toMatchObject({
      code: 'MISSING_PREREQUISITE',
      message: expect.stringContaining('flock'),
    })
    expect(infra.calls).toEqual([])
  })

  it('C7: refuses while another dev:up holds the worktree lock, leaving it alone', async () => {
    const root = temporaryRepository()
    mkdirSync(join(root, '.dev'))
    const holder = spawn('flock', [join(root, '.dev/up.lock'), 'sh', '-c', 'echo held; exec sleep 30'])
    await new Promise((resolve) => holder.stdout.once('data', resolve))
    const infra = fakeInfrastructure()
    try {
      await expect(up({ root, ...loaded(infra), out: output().write })).rejects.toMatchObject({
        code: 'DEV_UP_IN_PROGRESS',
      })
      expect(infra.calls).toEqual([])
      expect(holder.exitCode).toBeNull()
    } finally {
      holder.kill()
    }
  })

  it('prints a refusal as one line on stderr, CODE: message, and exits 1', async () => {
    const root = temporaryRepository()
    git(root, 'checkout', '--quiet', '--detach')
    const stdout = output()
    const stderr = output()
    const status = await run(['up'], {
      cwd: root,
      stdout: stdout.write,
      stderr: stderr.write,
      infra: fakeInfrastructure(),
    })
    expect(status).toBe(1)
    expect(stderr.lines).toEqual([expect.stringMatching(/^DETACHED_HEAD: /)])
  })

  it('exits 2 on an unexpected failure, and refuses an unknown command', async () => {
    const infra = fakeInfrastructure()
    infra.prerequisites.missing = async () => {
      throw new Error('boom')
    }
    const stderr = output()
    const io = { cwd: temporaryRepository(), stdout: output().write, stderr: stderr.write, infra }
    expect(await run(['up'], io)).toBe(2)
    expect(stderr.lines.join('\n')).toContain('boom')
    expect(await run(['nope'], io)).toBe(1)
    expect(stderr.lines.at(-1)).toMatch(/^UNKNOWN_COMMAND: nope/)
  })
})

describe('prerequisite probe', () => {
  const present = async () => ({ ok: true, output: 'Proxy is responding on port 443' })

  it('reports nothing missing when every tool answers', async () => {
    expect(await probePrerequisites({ exec: present, nodeVersion: '24.21.0' })).toBeUndefined()
  })

  it('C6: names the first missing tool', async () => {
    const exec = async (command: string) => (command === 'flock' ? { ok: false, output: '' } : present())
    expect(await probePrerequisites({ exec, nodeVersion: '24.21.0' })).toBe('flock')
  })

  it('C6: names ss, which finds the holder of a port', async () => {
    const exec = async (command: string) => (command === 'ss' ? { ok: false, output: '' } : present())
    expect(await probePrerequisites({ exec, nodeVersion: '24.21.0' })).toBe('ss')
  })

  it('names docker compose, a stopped portless proxy, and an old Node', async () => {
    const noCompose = async (command: string, args: readonly string[]) =>
      command === 'docker' && args[0] === 'compose' ? { ok: false, output: '' } : present()
    expect(await probePrerequisites({ exec: noCompose, nodeVersion: '24.0.0' })).toBe('docker compose')
    const proxyDown = async (command: string) =>
      command === 'portless' ? { ok: true, output: 'fail  Proxy is not responding' } : present()
    expect(await probePrerequisites({ exec: proxyDown, nodeVersion: '24.0.0' })).toBe(
      'the portless proxy (portless proxy start)',
    )
    expect(await probePrerequisites({ exec: present, nodeVersion: '22.11.0' })).toBe('Node 24')
  })
})
