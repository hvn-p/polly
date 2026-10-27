import { type ChildProcess, spawn } from 'node:child_process'
import { join } from 'node:path'
import { afterEach } from 'vitest'

const monitorScript = join(import.meta.dirname, '..', '..', 'bin', 'agent-events.mjs')

// Records every host name the monitor resolves, and resolves none: no request
// can leave the machine.
const interceptResolution = `
import dns from 'node:dns'
const refuse = (hostname, options, callback) => {
  process.stderr.write('RESOLVE ' + hostname + '\\n')
  const done = typeof options === 'function' ? options : callback
  done(Object.assign(new Error('resolution intercepted'), { code: 'ENOTFOUND' }))
}
dns.lookup = refuse
`

const running: ChildProcess[] = []
afterEach(() => {
  for (const child of running.splice(0)) {
    child.kill()
  }
})

export interface Monitor {
  stdout: string[]
  stderr: string[]
  child: ChildProcess
}

export function startMonitor(env: Record<string, string>): Monitor {
  const child = spawn(
    process.execPath,
    ['--import', `data:text/javascript,${encodeURIComponent(interceptResolution)}`, monitorScript],
    { env: { PATH: process.env['PATH'] ?? '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  running.push(child)
  const monitor: Monitor = { stdout: [], stderr: [], child }
  const collect = (lines: string[]) => (chunk: Buffer) => {
    lines.push(
      ...chunk
        .toString()
        .split('\n')
        .filter((line) => line !== ''),
    )
  }
  child.stdout?.on('data', collect(monitor.stdout))
  child.stderr?.on('data', collect(monitor.stderr))
  return monitor
}
