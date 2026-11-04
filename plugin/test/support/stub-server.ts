import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface StubRequest {
  url: string
  authorization: string | undefined
}

// A stand-in for the agent-event stream: each connection is answered by the
// next scripted behaviour, the last one repeating.
export type Behaviour = (request: IncomingMessage, response: ServerResponse) => void

export async function stubServer(behaviours: Behaviour[]) {
  const requests: StubRequest[] = []
  const server = createServer((request, response) => {
    requests.push({ url: request.url ?? '', authorization: request.headers.authorization })
    const behaviour = behaviours[Math.min(requests.length - 1, behaviours.length - 1)]
    behaviour?.(request, response)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/api/agent-events`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

export const sendEvents =
  (...frames: string[]): Behaviour =>
  (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    for (const frame of frames) {
      response.write(frame)
    }
  }

export const endWith =
  (...frames: string[]): Behaviour =>
  (request, response) => {
    sendEvents(...frames)(request, response)
    response.end()
  }

export const refuse =
  (status: number, code: string): Behaviour =>
  (_request, response) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ code }))
  }

export const hang: Behaviour = (_request, response) => {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
}
