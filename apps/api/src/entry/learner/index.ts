// The learner's routes of the contract: who the token names, and binding an
// event listener's code to them. Each calls one flow; the event code is checked
// exactly by the back, so a malformed one gets its named refusal.

import { type EventCodeStore, startLesson } from '@polly/back'
import { operations } from '../contracts/api.ts'
import type { RouteRegistry } from '../routes.ts'

export function registerLearnerRoutes(registry: RouteRegistry, codes: EventCodeStore): void {
  const { getMe, bindEventCode } = operations
  registry.add({
    method: getMe.method,
    path: getMe.path,
    access: getMe.access,
    handle: (_request, { learnerId }) => Response.json({ learnerId }),
  })
  registry.add({
    method: bindEventCode.method,
    path: bindEventCode.path,
    access: bindEventCode.access,
    handle: async (request, { learnerId }) => {
      const body = (await request.json().catch(() => undefined)) as { code?: unknown } | undefined
      const code = typeof body?.code === 'string' ? body.code : ''
      return Response.json(await startLesson({ codes }, learnerId, code))
    },
  })
}
