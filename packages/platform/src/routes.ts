// Every route declares its access rule from its process's closed set
// (constitution principle XV). A route cannot be registered without one, and
// its handler only runs once the rule has let the request through. A rule or a
// route refuses by throwing a Refusal, answered by the process's translation.

import { Refusal } from './refusal.ts'

// A response is passed on as is: a rule may answer a request it refuses
// itself (the OAuth challenge of an unauthenticated request).
export type Guard<Context> = (request: Request) => Promise<Context | Response>

// For each access rule of a process, what it establishes about a request.
export type Guards<Contexts> = { [A in keyof Contexts]: Guard<Contexts[A]> }

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

interface RouteOf<Contexts, A extends keyof Contexts> {
  // ALL matches every method: for a handler that routes by method itself.
  method: Method | 'ALL'
  path: string
  access: A
  handle: (request: Request, context: Contexts[A]) => Response | Promise<Response>
}

export type Route<Contexts> = { [A in keyof Contexts]: RouteOf<Contexts, A> }[keyof Contexts]

export class RouteRegistry<Contexts> {
  readonly #guards: Guards<Contexts>
  readonly #refuse: (refusal: Refusal) => Response
  readonly #routes: Route<Contexts>[] = []

  constructor(guards: Guards<Contexts>, refuse: (refusal: Refusal) => Response) {
    this.#guards = guards
    this.#refuse = refuse
  }

  add(route: Route<Contexts>): this {
    if (!Object.hasOwn(this.#guards, route.access)) {
      const rules = Object.keys(this.#guards).join(', ')
      throw new Error(`Route ${route.method} ${route.path}: access must be one of ${rules}`)
    }
    this.#routes.push(route)
    return this
  }

  routes(): readonly Route<Contexts>[] {
    return this.#routes
  }

  // The request handler of a route: its access rule first, then the route.
  handler(route: Route<Contexts>): (request: Request) => Promise<Response> {
    return async (request) => {
      try {
        const guard = this.#guards[route.access] as Guard<unknown>
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
          return this.#refuse(error)
        }
        throw error
      }
    }
  }
}
