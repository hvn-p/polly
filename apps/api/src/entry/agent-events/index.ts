// The stub agent-event stream, GET /api/agent-events: the event listener
// connects with its event code in `Authorization: Bearer <code>`, never in the
// URL. A bound connection gets one test event, then a comment every 15 s. An
// unbound one gets nothing, checks its binding every second, and is closed
// after 120 s. It carries no learner data and touches no session log; the
// session log's stream replaces it.

import { bindingOf, connectEventStream, type EventCodeStore } from '@polly/back'
import type { Clock } from '@polly/platform'
import { Refusal } from '@polly/platform'
import type { z } from 'zod'
import type { refusalCode } from '../contracts/agent-events.ts'
import type { Guard, RouteRegistry } from '../routes.ts'

const BINDING_CHECK_MS = 1_000
const UNBOUND_LIMIT_MS = 120_000
const KEEPALIVE_MS = 15_000

// The stream's refusals are its contract's.
function refused(code: z.infer<typeof refusalCode>, message: string): Refusal {
  return new Refusal(code, message)
}

export function eventCodeGuard(codes: EventCodeStore): Guard<'event-code'> {
  return async (request) => {
    const header = request.headers.get('authorization') ?? ''
    if (!header.startsWith('Bearer ')) {
      throw refused('UNAUTHORIZED', 'the event code goes in Authorization: Bearer <code>')
    }
    return { codeHash: await connectEventStream({ codes }, header.slice('Bearer '.length)) }
  }
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function registerAgentEventRoute(registry: RouteRegistry, codes: EventCodeStore, clock: Clock): void {
  registry.add({
    method: 'GET',
    path: '/api/agent-events',
    access: 'event-code',
    handle: (request, { codeHash }) => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const open = () => !request.signal.aborted
          const send = (text: string) => controller.enqueue(encoder.encode(text))
          const startedAt = clock.now()
          while (open() && (await bindingOf({ codes }, codeHash)).state !== 'bound') {
            if (clock.now() - startedAt >= UNBOUND_LIMIT_MS) {
              send(frame('error', { code: 'EVENT_CODE_NOT_BOUND' }))
              controller.close()
              return
            }
            await clock.sleep(BINDING_CHECK_MS)
          }
          if (open()) {
            send(frame('test', { type: 'test' }))
          }
          while (open()) {
            await clock.sleep(KEEPALIVE_MS)
            if (open()) {
              send(': keepalive\n\n')
            }
          }
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      })
    },
  })
}
