// The API's client on the worktree's own origin: the web reaches the back, the
// sign-in and the consent included, through the API's contract only. The
// browser's session cookie goes with each same-origin call.

import { createApiClient } from '@polly/contract'

export const api = createApiClient({ baseUrl: window.location.origin })
