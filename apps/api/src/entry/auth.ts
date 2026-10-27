// Better Auth's routes on the worktree's origin: sign-in and the OAuth 2.1
// endpoints under /api/auth, and the discovery metadata under /.well-known.
// Both are public: Better Auth checks each request itself.

import type { Identity } from '../reference/identity/index.ts'
import type { RouteRegistry } from './routes.ts'

export function registerAuthRoutes(registry: RouteRegistry, identity: Identity): void {
  for (const path of ['/api/auth/*', '/.well-known/*']) {
    registry.add({ method: 'ALL', path, access: 'public', handle: (request) => identity.handler(request) })
  }
}
