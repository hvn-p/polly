import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checked } from '../src/e2e/command.ts'

// An executable that prints a line and exits with the given status.
function tool(status: number, script = 'echo "element not found"'): string {
  const file = join(mkdtempSync(join(tmpdir(), 'tool-')), 'agent-browser')
  writeFileSync(file, `#!/bin/sh\n${script}\nexit ${status}\n`)
  chmodSync(file, 0o755)
  return file
}

describe('a checked command', () => {
  it('FR-024: resolves with its output when it succeeds', async () => {
    expect(await checked(tool(0), ['wait', 'x'], 'agent-browser wait')).toBe('element not found\n')
  })

  it('FR-024: rejects naming the command and what it printed when it fails', async () => {
    await expect(checked(tool(1), ['find', 'role', 'button'], 'agent-browser find')).rejects.toThrow(
      'agent-browser find failed: element not found',
    )
  })

  it('FR-024: rejects when the command cannot start', async () => {
    await expect(checked('/nonexistent/agent-browser', [], 'agent-browser open')).rejects.toThrow(
      /^agent-browser open failed: .*ENOENT/,
    )
  })
  it('FR-024: resolves with what it printed on stdout only', async () => {
    expect(
      await checked(tool(0, 'echo "warning" >&2\necho "https://x/"'), ['get', 'url'], 'agent-browser get'),
    ).toBe('https://x/\n')
  })

  it('FR-024: rejects with what it printed on stderr as well', async () => {
    await expect(
      checked(tool(1, 'echo "Element not found" >&2'), ['get'], 'agent-browser get'),
    ).rejects.toThrow('agent-browser get failed: Element not found')
  })

  it('runs with the environment given', async () => {
    expect(
      await checked(tool(0, 'echo "$POLLY_PROBE"'), [], 'probe', { ...process.env, POLLY_PROBE: 'given' }),
    ).toBe('given\n')
  })
})
