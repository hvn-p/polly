// A reader of the agent-event stream, as the event listener reads it.
export interface StreamReader {
  status: number
  body: unknown
  // The frames received so far: `event:` frames as { event, data }, comment
  // frames as { comment }.
  frames: { event?: string; data?: unknown; comment?: string }[]
  ended: Promise<void>
  isEnded: () => boolean
  close: () => void
}

export async function openStream(url: string, headers: Record<string, string> = {}): Promise<StreamReader> {
  const controller = new AbortController()
  const response = await fetch(url, { headers, signal: controller.signal })
  const frames: StreamReader['frames'] = []
  if (!(response.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
    return {
      status: response.status,
      body: await response.json(),
      frames,
      ended: Promise.resolve(),
      isEnded: () => true,
      close: () => undefined,
    }
  }
  let ended = false
  const done = (async () => {
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for await (const chunk of response.body ?? []) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true })
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          if (frame.startsWith(':')) {
            frames.push({ comment: frame.slice(1).trim() })
          } else {
            const event = /^event: (.*)$/m.exec(frame)?.[1]
            const data = /^data: (.*)$/m.exec(frame)?.[1]
            frames.push({
              ...(event === undefined ? {} : { event }),
              data: data === undefined ? undefined : JSON.parse(data),
            })
          }
          boundary = buffer.indexOf('\n\n')
        }
      }
    } catch {
      // Aborted by the test.
    }
    ended = true
  })()
  return {
    status: response.status,
    body: undefined,
    frames,
    ended: done,
    isEnded: () => ended,
    close: () => controller.abort(),
  }
}
