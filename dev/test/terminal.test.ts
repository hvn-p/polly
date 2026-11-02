import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inTerminal } from '../src/e2e/claude.ts'

const cwd = () => mkdtempSync(join(tmpdir(), 'terminal-'))

describe('a command in a pseudo-terminal', () => {
  it('FR-024: shows why it could not start, and stops at once', async () => {
    const terminal = inTerminal(['true'], { PATH: cwd() }, cwd())
    terminal.type('/exit\r')
    await terminal.stop(60_000)
    expect(terminal.output()).toMatch(/script.*ENOENT/)
  })
})
