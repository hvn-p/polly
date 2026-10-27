// Every route declares its access rule from a closed set (constitution
// principle XV). A route cannot be registered without one, and its handler only
// runs once the rule has let the request through. A rule or a route refuses by
// throwing a Refusal, answered with its HTTP translation.

import { Refusal } from '../kernel/refusal/index.ts'
import { refusalResponse } from './refusals.ts'

export type Access = 'public' | 'learner' | 'event-code'

// What each access rule establishes about the request it lets through.
export interface AccessContext {
  public: Record<never, never>
  learner: { learnerId: string }
  'event-code': { codeHash: string }
}

// A response is passed on as is: Better Auth answers a request it refuses
// itself (the OAuth challenge of an MCP request).
export type Guard<A extends Access> = (request: Request) => Promise<AccessContext[A] | Response>

export type Guards = { [A in Access]: Guard<A> }

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

interface RouteOf<A extends Access> {
  // ALL matches every method: for a handler that routes by method itself.
  method: Method | 'ALL'
  path: string
  access: A
  handle: (request: Request, context: AccessContext[A]) => Response | Promise<Response>
}

export type Route = { [A in Access]: RouteOf<A> }[Access]

const ACCESS_RULES: readonly Access[] = ['public', 'learner', 'event-code']

export class RouteRegistry {
  readonly #guards: Guards
  readonly #routes: Route[] = []

  constructor(guards: Guards) {
    this.#guards = guards
  }

  add(route: Route): this {
    if (!ACCESS_RULES.includes(route.access)) {
      throw new Error(`Route ${route.method} ${route.path}: access must be one of ${ACCESS_RULES.join(', ')}`)
    }
    this.#routes.push(route)
    return this
  }

  routes(): readonly Route[] {
    return this.#routes
  }

  // The request handler of a route: its access rule first, then the route.
  handler(route: Route): (request: Request) => Promise<Response> {
    return async (request) => {
      try {
        const guard = this.#guards[route.access] as Guard<typeof route.access>
        const context = await guard(request)
        if (context instanceof Response) {
          return context
        }
        return await (route.handle as (request: Request, context: unknown) => Response | Promise<Response>)(
          request,
          context,
        )
      } catch (error) {
        if (error instanceof Refusal) {
          return refusalResponse(error)
        }
        throw error
      }
    }
  }
}
