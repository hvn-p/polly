// How the processes' adapter reports a process that does not start, against a
// docker command that answers as Compose would.

import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { composeProcesses } from '../src/infra/processes.ts'

const codeRoot = join(import.meta.dirname, '..', '..')
const bin = mkdtempSync(join(tmpdir(), 'fake-docker-'))
const path = process.env['PATH']

// `up` fails; `ps` lists the MCP server unhealthy and the worker exited,
// unless FAKE_PS_FAILS is set, when it fails too.
beforeAll(() => {
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh
case "$*" in
  *"config --services"*) printf 'install\\nmcp\\nworker\\n' ;;
  "volume create"*) ;;
  *" up "*) echo "dependency failed to start: worker exited (1)" >&2; exit 1 ;;
  *" ps "*)
    if [ -n "$FAKE_PS_FAILS" ]; then echo "ps: daemon unreachable" >&2; exit 1; fi
    echo '{"Service":"install","State":"exited","Health":"","ExitCode":0}'
    echo '{"Service":"mcp","State":"running","Health":"unhealthy","ExitCode":0}'
    echo '{"Service":"worker","State":"exited","Health":"","ExitCode":1}' ;;
esac
`,
  )
  chmodSync(join(bin, 'docker'), 0o755)
  process.env['PATH'] = `${bin}:${path}`
})

afterAll(() => {
  process.env['PATH'] = path
  delete process.env['FAKE_PS_FAILS']
})

describe('the processes adapter, when a process does not start', () => {
  const processes = composeProcesses({ codeRoot })
  const project = {
    name: 'polly-probe',
    identity: 'probe',
    root: mkdtempSync(join(tmpdir(), 'polly-probe-')),
  }

  it('C76: names the process a restart asked for, not another one that is not ready', async () => {
    await expect(processes.restart(project, 'worker')).rejects.toMatchObject({
      code: 'PROCESS_NOT_READY',
      message: expect.stringMatching(/^worker is exited; see .*worker\.log/),
    })
  })

  it("C76: keeps the up's own error when listing the processes fails", async () => {
    process.env['FAKE_PS_FAILS'] = '1'
    try {
      await expect(processes.restart(project, 'worker')).rejects.toThrow(/worker exited \(1\)/)
    } finally {
      delete process.env['FAKE_PS_FAILS']
    }
  })
})
