// The stub agent-event stream, GET /api/agent-events: the event listener
// connects with its event code in `Authorization: Bearer <code>`, never in the
// URL. A bound connection gets one test event, then a comment every 15 s. An
// unbound one gets nothing, checks its binding every second, and is closed
// after 120 s, or at once when its code is revoked meanwhile. It carries no learner data and touches no session log; the
// session log's stream replaces it.

import { bindingOf, connectEventStream, type EventCodeStore } from '@polly/back'
import type { Clock } from '@polly/platform'
import { Refusal } from '@polly/platform'
import { operations } from '../contracts/api.ts'
import type { RefusalCode } from '../contracts/refusals.ts'
import { eventFrame, keepaliveFrame, refusalFrame, streamResponse } from '../refusals.ts'
import type { Guard, RouteRegistry } from '../routes.ts'

const BINDING_CHECK_MS = 1_000
const UNBOUND_LIMIT_MS = 120_000
const KEEPALIVE_MS = 15_000

// The stream's refusals are its contract's.
function refused(code: RefusalCode, message: string): Refusal {
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

export function registerAgentEventRoute(registry: RouteRegistry, codes: EventCodeStore, clock: Clock): void {
  const { agentEvents } = operations
  registry.add({
    method: agentEvents.method,
    path: agentEvents.path,
    access: agentEvents.access,
    handle: (request, { codeHash }) => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const open = () => !request.signal.aborted
          const send = (text: string) => controller.enqueue(encoder.encode(text))
          const end = (refusal: Refusal) => {
            send(refusalFrame(agentEvents, refusal))
            controller.close()
          }
          const startedAt = clock.now()
          for (;;) {
            let binding: Awaited<ReturnType<typeof bindingOf>>
            try {
              binding = await bindingOf({ codes }, codeHash)
            } catch (error) {
              // A code revoked while it waits: the listener draws a new one.
              if (error instanceof Refusal) {
                end(error)
                return
              }
              throw error
            }
            if (!open() || binding.state === 'bound') {
              break
            }
            if (clock.now() - startedAt >= UNBOUND_LIMIT_MS) {
              end(
                refused(
                  'EVENT_CODE_NOT_BOUND',
                  'no learner bound this code within 120 s: bind it with start_lesson',
                ),
              )
              return
            }
            await clock.sleep(BINDING_CHECK_MS)
          }
          if (open()) {
            send(eventFrame({ type: 'test' }))
          }
          while (open()) {
            await clock.sleep(KEEPALIVE_MS)
            if (open()) {
              send(keepaliveFrame())
            }
          }
          controller.close()
        },
      })
      return streamResponse(agentEvents, stream)
    },
  })
}
