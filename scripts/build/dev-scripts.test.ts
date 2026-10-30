import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = join(import.meta.dirname, '..', '..')
const scripts = (
  JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
).scripts

// Runs a root script as pnpm runs it (sh -c), with fake pnpm and node first on
// the PATH: pnpm prints what an install prints, node stands for the build and
// for the dev command, which prints the worktree URL; `fail` names a step that fails.
function run(name: string, fail?: 'install' | 'build') {
  const bin = mkdtempSync(join(tmpdir(), 'dev-scripts-'))
  const fake = (tool: string, body: string) => {
    writeFileSync(join(bin, tool), `#!/bin/sh\n${body}\n`)
    chmodSync(join(bin, tool), 0o755)
  }
  fake('pnpm', `echo "Lockfile is up to date"\n${fail === 'install' ? 'exit 1' : 'exit 0'}`)
  fake(
    'node',
    [
      'case "$1" in',
      `  scripts/build/processes.ts) echo "built" >&2; ${fail === 'build' ? 'exit 2' : 'exit 0'} ;;`,
      '  *) echo "https://probe.polly.localhost" ;;',
      'esac',
    ].join('\n'),
  )
  mkdirSync(join(bin, 'cwd'))
  return spawnSync('sh', ['-c', scripts[name] ?? ''], {
    cwd: join(bin, 'cwd'),
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}` },
    encoding: 'utf8',
  })
}

describe('the dev scripts of the root manifest', () => {
  it('dev:up prints the worktree URL alone on stdout, the install and the build on stderr', () => {
    const result = run('dev:up')
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('https://probe.polly.localhost\n')
    expect(result.stderr).toContain('Lockfile is up to date')
  })

  it('dev:up exits 2 when the install or the build fails, before the dev command runs', () => {
    for (const fail of ['install', 'build'] as const) {
      const result = run('dev:up', fail)
      expect({ fail, status: result.status, stdout: result.stdout }).toEqual({ fail, status: 2, stdout: '' })
    }
  })

  it('the build exits 2 when it fails, as an unexpected failure of a dev command does', () => {
    const result = spawnSync(process.execPath, [join(repositoryRoot, 'scripts/build/processes.ts'), 'nope'], {
      encoding: 'utf8',
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('unknown process nope')
  })
})
