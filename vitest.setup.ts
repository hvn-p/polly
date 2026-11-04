// Refuses any outbound connection from a test (constitution principle XII):
// only loopback and Unix sockets are reachable. A refused connection fails
// with OUTBOUND_NETWORK_REFUSED and also fails the test that opened it, even
// when the code under test swallows the error.

import { isIP, Socket } from 'node:net'
import { afterEach } from 'vitest'

const refused: string[] = []

export function takeRefusedConnections(): string[] {
  return refused.splice(0)
}

function isLoopback(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '')
  if (bare === 'localhost' || bare.endsWith('.localhost')) {
    return true
  }
  if (isIP(bare) === 4) {
    return bare.startsWith('127.')
  }
  return bare === '::1' || bare.startsWith('::ffff:127.')
}

type Target = { path: string } | { host: string; port: string }

function targetOf(args: unknown[]): Target {
  const first = Array.isArray(args[0]) ? (args[0] as unknown[])[0] : args[0]
  if (typeof first === 'object' && first !== null) {
    const options = first as { path?: string; host?: string; port?: number | string }
    if (options.path !== undefined) {
      return { path: options.path }
    }
    return { host: options.host ?? 'localhost', port: String(options.port) }
  }
  if (typeof first === 'string' && Number.isNaN(Number(first))) {
    return { path: first }
  }
  return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: String(first) }
}

const connect = Socket.prototype.connect
Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
  const target = targetOf(args)
  if ('host' in target && !isLoopback(target.host)) {
    const destination = `${target.host}:${target.port}`
    refused.push(destination)
    const error = new Error(`OUTBOUND_NETWORK_REFUSED: ${destination}; tests reach loopback only`)
    process.nextTick(() => this.destroy(error))
    return this
  }
  return Reflect.apply(connect, this, args) as Socket
} as typeof connect

afterEach(() => {
  const destinations = takeRefusedConnections()
  if (destinations.length > 0) {
    throw new Error(`OUTBOUND_NETWORK_REFUSED: the test tried to reach ${destinations.join(', ')}`)
  }
})
