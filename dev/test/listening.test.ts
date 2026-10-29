import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { listeningPorts } from '../src/infra/listening.ts'

describe('listening ports', () => {
  it('tells a port another process listens on from a free one', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    try {
      expect(await listeningPorts().isHeld(port)).toBe(true)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
    expect(await listeningPorts().isHeld(port)).toBe(false)
  })
})
