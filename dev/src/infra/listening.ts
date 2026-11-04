// Whether a TCP port is taken: listening on it fails when another process
// does, on any platform.

import { createServer } from 'node:net'
import type { PortTable } from '../ports/index.ts'

export function listeningPorts(): PortTable {
  return {
    isHeld: (port) =>
      new Promise((resolve) => {
        const probe = createServer()
        probe.once('error', () => resolve(true))
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(false)))
      }),
  }
}
