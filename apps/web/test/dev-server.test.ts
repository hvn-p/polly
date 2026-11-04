// @vitest-environment node
// The front-end dev server is the worktree's origin: what it proxies must end
// when the process behind it ends, or a client of a stream never learns of it.

import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

const CONFIG = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

let upstream: Server | undefined
let devServer: ViteDevServer | undefined

afterEach(async () => {
  await devServer?.close()
  upstream?.closeAllConnections()
  await new Promise((resolve) => upstream?.close(resolve) ?? resolve(undefined))
})

async function listening(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

describe('front-end dev server', () => {
  it("C42: a proxied event stream ends when the API's process ends", async () => {
    upstream = createHttpServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(': open\n\n')
    })
    process.env['POLLY_API_PORT'] = String(await listening(upstream))
    process.env['POLLY_MCP_PORT'] = '1'
    process.env['POLLY_WEB_PORT'] = '0'
    devServer = await createServer({ configFile: CONFIG, logLevel: 'silent' })
    await devServer.listen()
    const { port } = (devServer.httpServer as Server).address() as AddressInfo

    const response = await fetch(`http://127.0.0.1:${port}/api/agent-events`)
    const reader = (response.body as ReadableStream<Uint8Array>).getReader()
    await reader.read()
    // The API's process ends: its sockets close mid-stream.
    upstream.closeAllConnections()

    const ended = await Promise.race([
      reader.read().then(
        ({ done }) => (done ? 'ended' : 'data'),
        () => 'ended',
      ),
      new Promise((resolve) => setTimeout(resolve, 3000, 'still open')),
    ])
    expect(ended).toBe('ended')
  })
})
