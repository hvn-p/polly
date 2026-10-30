// The learner's routes of the contract: who the request names, and binding an
// event listener's code to them. Each calls one flow; a body is read through the
// contract's schema, and a malformed event code gets its named refusal.

import { describeLearner, type EventCodeStore, type LearnerDirectory, startLesson } from '@polly/back'
import { Refusal } from '@polly/platform'
import { eventCodeBinding, operations } from '../contracts/api.ts'
import type { RouteRegistry } from '../routes.ts'

export function registerLearnerRoutes(
  registry: RouteRegistry,
  codes: EventCodeStore,
  directory: LearnerDirectory,
): void {
  const { getMe, bindEventCode } = operations
  registry.add({
    method: getMe.method,
    path: getMe.path,
    access: getMe.access,
    handle: async (_request, { learnerId }) => Response.json(await describeLearner({ directory }, learnerId)),
  })
  registry.add({
    method: bindEventCode.method,
    path: bindEventCode.path,
    access: bindEventCode.access,
    handle: async (request, { learnerId }) => {
      const parsed = eventCodeBinding.safeParse(await request.json().catch(() => undefined))
      if (!parsed.success) {
        throw new Refusal(
          'INVALID_EVENT_CODE',
          'the event code must be the 43 characters your event listener printed',
        )
      }
      return Response.json(await startLesson({ codes }, learnerId, parsed.data.code))
    },
  })
}
