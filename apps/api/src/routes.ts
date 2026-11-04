// The API's access rules (constitution principle XV): the closed set its
// routes declare one of, each registered through the socle's registry and
// refused with the API's HTTP translation.

import * as platform from '@polly/platform'
import { refusalResponse } from './refusals.ts'

// What each access rule establishes about the request it lets through.
export interface AccessContext {
  public: Record<never, never>
  learner: { learnerId: string }
  'event-code': { codeHash: string }
}

export type Access = keyof AccessContext

export type Guard<A extends Access> = platform.Guard<AccessContext[A]>

export type Guards = platform.Guards<AccessContext>

export type Route = platform.Route<AccessContext>

export class RouteRegistry extends platform.RouteRegistry<AccessContext> {
  constructor(guards: Guards) {
    super(guards, refusalResponse)
  }
}
