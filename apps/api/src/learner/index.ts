// The learner's routes of the contract: who the request names, and binding an
// event listener's code to them. Each calls one flow; the event code is checked
// exactly by the back, so a malformed one gets its named refusal.

import { describeLearner, type EventCodeStore, type LearnerDirectory, startLesson } from '@polly/back'
import { operations } from '../contracts/api.ts'
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
      const body = (await request.json().catch(() => undefined)) as { code?: unknown } | undefined
      const code = typeof body?.code === 'string' ? body.code : ''
      return Response.json(await startLesson({ codes }, learnerId, code))
    },
  })
}
