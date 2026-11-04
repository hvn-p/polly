// The identity's own routes on the worktree's origin: sign-in and the OAuth 2.1
// endpoints under /api/auth, and the discovery metadata under /.well-known.
// Both are public: the identity checks each request itself.

import type { RouteRegistry } from './routes.ts'

export function registerAuthRoutes(
  registry: RouteRegistry,
  handler: (request: Request) => Promise<Response>,
): void {
  for (const path of ['/api/auth/*', '/.well-known/*']) {
    registry.add({ method: 'ALL', path, access: 'public', handle: (request) => handler(request) })
  }
}
