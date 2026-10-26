import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { listeningPorts } from '../src/infra/listening.ts'

describe('listening ports', () => {
  it('names the process holding a port, and nothing for a free one', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    try {
      expect(await listeningPorts().holderOf(port)).toBe(`node (pid ${process.pid})`)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
    expect(await listeningPorts().holderOf(port)).toBeUndefined()
  })
})
