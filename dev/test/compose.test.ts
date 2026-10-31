import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { composeInfrastructure } from '../src/infra/compose.ts'
import { containerIds, isolatedInfrastructure } from './support/isolated-infrastructure.ts'

let infra: Awaited<ReturnType<typeof isolatedInfrastructure>>

beforeAll(async () => {
  infra = await isolatedInfrastructure()
})

afterAll(() => {
  infra.destroy()
})

describe('shared infrastructure (compose)', { timeout: 180_000 }, () => {
  it('C1: starts Postgres and Garage when they are not running', async () => {
    await infra.ensureRunning()
    expect(await infra.exec('postgres', ['pg_isready', '-U', 'postgres'])).toContain('accepting connections')
    expect(await infra.exec('garage', ['/garage', 'status'])).toContain('HEALTHY NODES')
  })

  it('C8: three starts at the same time leave one set of containers', async () => {
    const before = containerIds(infra.project)
    await Promise.all([infra.ensureRunning(), infra.ensureRunning(), infra.ensureRunning()])
    expect(containerIds(infra.project)).toBe(before)
    expect(before.split(',')).toHaveLength(2)
  })

  it('C17: starts it again once stopped, keeping its data', async () => {
    await infra.exec('postgres', ['psql', '-U', 'postgres', '-c', 'create database kept'])
    execFileSync('docker', ['compose', '-p', infra.project, 'stop'], { stdio: 'ignore' })
    await infra.ensureRunning()
    const databases = await infra.exec('postgres', [
      'psql',
      '-U',
      'postgres',
      '-tAc',
      'select datname from pg_database',
    ])
    expect(databases.split('\n')).toContain('kept')
  })

  it('refuses to recreate the running containers from a compose file that differs, naming the service', async () => {
    await infra.ensureRunning()
    const before = containerIds(infra.project)
    const changed = join(mkdtempSync(join(tmpdir(), 'compose-')), 'compose.yaml')
    const source = readFileSync(join(import.meta.dirname, '../compose.yaml'), 'utf8')
    writeFileSync(
      changed,
      source.replace('restart: unless-stopped\n    command:', 'restart: always\n    command:'),
    )
    const branch = composeInfrastructure({ ...infra.settings, composeFile: changed })
    await expect(branch.ensureRunning()).rejects.toMatchObject({
      code: 'SHARED_INFRASTRUCTURE_DIFFERS',
      message: expect.stringMatching(/garage/),
    })
    expect(containerIds(infra.project)).toBe(before)
  })
})
