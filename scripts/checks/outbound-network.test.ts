import { createServer, type NetConnectOpts, connect as netConnect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { takeRefusedConnections } from '../../vitest.setup.ts'

afterEach(() => {
  takeRefusedConnections()
})

function attempt(options: NetConnectOpts): Promise<string> {
  return new Promise((resolve) => {
    const socket = netConnect(options)
    socket.on('error', (error) => resolve(error.message))
    socket.on('connect', () => {
      socket.destroy()
      resolve('connected')
    })
  })
}

describe('outbound network refusal in tests', () => {
  it('refuses a connection to a public address and records it', async () => {
    expect(await attempt({ port: 80, host: '93.184.215.14' })).toMatch(
      /OUTBOUND_NETWORK_REFUSED: 93\.184\.215\.14:80/,
    )
    expect(takeRefusedConnections()).toEqual(['93.184.215.14:80'])
  })

  it('refuses a public host name, whatever the call shape', async () => {
    expect(await attempt({ host: 'example.com', port: 443 })).toMatch(/OUTBOUND_NETWORK_REFUSED/)
    await expect(fetch('http://example.com/')).rejects.toThrow()
    expect(takeRefusedConnections()).toEqual(['example.com:443', 'example.com:80'])
  })

  it('lets loopback connections through', async () => {
    const server = createServer((socket) => socket.end())
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    expect(await attempt({ port, host: '127.0.0.1' })).toBe('connected')
    expect(await attempt({ port, host: 'localhost' })).toBe('connected')
    server.close()
    expect(takeRefusedConnections()).toEqual([])
  })
})
