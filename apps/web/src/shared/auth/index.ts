// Better Auth's client, on the worktree's own origin. Its OAuth provider plugin
// carries the signed authorization request from the sign-in and consent pages
// back to the server, so the flow resumes once the learner has acted.

import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({ plugins: [oauthProviderClient()] })

// Where the server asks the page to go next, when it does.
export function nextLocation(data: unknown): string | undefined {
  if (typeof data === 'object' && data !== null && 'url' in data && typeof data.url === 'string') {
    return data.url
  }
  return undefined
}
