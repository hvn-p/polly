import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { probeClaude, probeDriverTools } from '../src/e2e/client.ts'

// A directory for PATH holding a fake claude that prints its auth status.
function fakeClaude(status: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'claude-'))
  writeFileSync(join(directory, 'claude'), `#!/bin/sh\necho '${status}'\n`)
  chmodSync(join(directory, 'claude'), 0o755)
  return directory
}

describe('Claude Code probe', () => {
  it('C39: reports a signed-in client', async () => {
    const env = { PATH: fakeClaude('{"loggedIn": true}') }
    expect(await probeClaude(env)).toEqual({ installed: true, signedIn: true })
  })

  it('C39: reports a signed-out client', async () => {
    const env = { PATH: fakeClaude('{"loggedIn": false}') }
    expect(await probeClaude(env)).toEqual({ installed: true, signedIn: false })
  })

  it('C39: reports a missing client', async () => {
    const env = { PATH: mkdtempSync(join(tmpdir(), 'no-claude-')) }
    expect(await probeClaude(env)).toEqual({ installed: false, signedIn: false })
  })
})

// A directory for PATH holding the named tools, each answering its version.
function tools(...names: string[]): string {
  const directory = mkdtempSync(join(tmpdir(), 'tools-'))
  for (const name of names) {
    writeFileSync(join(directory, name), '#!/bin/sh\necho 1.0\n')
    chmodSync(join(directory, name), 0o755)
  }
  return directory
}

describe('driver tools probe', () => {
  it('reports nothing missing when script and agent-browser answer', async () => {
    expect(await probeDriverTools({ PATH: tools('script', 'agent-browser') })).toBeUndefined()
  })

  it('names the missing tool', async () => {
    expect(await probeDriverTools({ PATH: tools('agent-browser') })).toBe('script (util-linux)')
    expect(await probeDriverTools({ PATH: tools('script') })).toBe('agent-browser')
  })
})
