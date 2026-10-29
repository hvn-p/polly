import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { computeServices } from '../src/infra/compute.ts'
import { temporaryRepository } from './support/repository.ts'

const repositoryRoot = join(import.meta.dirname, '..', '..')
// A project of the test's own, never the shared polly-dev.
const project = `polly-dev-test-${randomBytes(3).toString('hex')}`
const compute = computeServices({ project, machineDirectory: mkdtempSync(join(tmpdir(), `${project}-`)) })
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
const running = () =>
  docker('ps', '--filter', `label=polly.compute.project=${project}`, '--format', '{{.Names}}')

afterAll(() => {
  const containers = docker('ps', '--all', '--quiet', '--filter', `label=polly.compute.project=${project}`)
  if (containers !== '') {
    docker('rm', '--force', ...containers.split('\n'))
  }
  const images = docker('images', '--quiet', `${project}-compute`)
  if (images !== '') {
    docker('rmi', '--force', ...new Set(images.split('\n')))
  }
})

describe('the compute services adapter', () => {
  it("fingerprints a worktree's services/compute from its files, committed or not, outside what git ignores", async () => {
    const root = temporaryRepository()
    mkdirSync(join(root, 'services/compute/src'), { recursive: true })
    writeFileSync(join(root, '.gitignore'), '.venv/\n')
    writeFileSync(join(root, 'services/compute/src/app.py'), 'one\n')
    const first = await compute.fingerprintOf(root)
    expect(first).toMatch(/^[0-9a-f]{12}$/)

    mkdirSync(join(root, 'services/compute/.venv'))
    writeFileSync(join(root, 'services/compute/.venv/installed'), 'noise\n')
    writeFileSync(join(root, 'README.md'), 'outside\n')
    expect(await compute.fingerprintOf(root)).toBe(first)

    writeFileSync(join(root, 'services/compute/src/app.py'), 'two\n')
    expect(await compute.fingerprintOf(root)).not.toBe(first)
  })

  it('C30, C31, C33: one service per fingerprint, shared by its users, stopped once none remains', {
    timeout: 300_000,
  }, async () => {
    const fingerprint = await compute.fingerprintOf(repositoryRoot)
    const a = await compute.use(fingerprint, 'worktree-a', repositoryRoot)
    expect(a).toMatchObject({ started: true, others: [] })
    expect(await fetch(`${a.url}/version`).then((r) => r.json())).toEqual({ fingerprint })

    const b = await compute.use(fingerprint, 'worktree-b')
    expect(b).toEqual({ url: a.url, started: false, others: [] })

    const own = await compute.use('0000000000bb', 'worktree-c', repositoryRoot)
    expect(own).toMatchObject({ started: true, others: [fingerprint] })

    await expect(compute.use('0000000000cc', 'worktree-d')).rejects.toMatchObject({
      code: 'UNKNOWN_COMPUTE_VERSION',
      message: expect.stringContaining('0000000000cc'),
    })

    await compute.release('0000000000bb', 'worktree-c')
    await compute.release(fingerprint, 'worktree-a')
    expect(running()).toBe(`${project}-compute-${fingerprint}`)
    await compute.release(fingerprint, 'worktree-b')
    expect(running()).toBe('')
    await compute.release(fingerprint, 'worktree-b')
  })
})
