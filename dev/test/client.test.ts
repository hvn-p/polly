import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { probeClaude } from '../src/e2e/client.ts'

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
