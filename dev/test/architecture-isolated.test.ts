// The architecture view's real adapter, through the analyzer's own command.

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { architectureView } from '../src/infra/architecture.ts'
import { temporaryRepository } from './support/repository.ts'

const codeRoot = join(import.meta.dirname, '..', '..')

describe("the architecture view's adapter", { timeout: 300_000 }, () => {
  it('names the project after the worktree, and starts nothing from a pinned version holding no view (#10)', async () => {
    const prefix = `polly-test-${randomBytes(3).toString('hex')}-`
    const view = architectureView({ codeRoot, prefix })
    const name = view.projectOf('probe')
    expect(name).toBe(`${prefix}probe-architecture`)
    const root = temporaryRepository()
    try {
      expect(
        await view.start(name, { root, port: 1, host: 'arch.probe.polly.localhost', from: 'package' }),
      ).toBe('unavailable')
      const containers = execFileSync(
        'docker',
        ['ps', '--all', '--quiet', '--filter', `label=com.docker.compose.project=${name}`],
        { encoding: 'utf8' },
      )
      expect(containers.trim()).toBe('')
    } finally {
      await view.stop(name)
    }
  })
})
