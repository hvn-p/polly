// The demo account of a local worktree: a learner whose credentials are
// public (dev/README.md), so an agent can sign in through the real flow.
// It exists only locally. Each feature that adds a domain extends this flow
// with that domain's data, through its flows.

import { Refusal } from '../../kernel/refusal/index.ts'
import { createLearnerAccount, type Identity } from '../../reference/identity/index.ts'

export const DEMO_ACCOUNT = {
  name: 'Demo Learner',
  email: 'demo@polly.localhost',
  password: 'polly-demo-learner',
}

// Returns the demo learner's id; an existing account is kept as it is.
export async function seedDemoAccount({
  environment,
  identity,
}: {
  environment: string
  identity: Identity
}): Promise<string> {
  if (environment !== 'local') {
    throw new Refusal('NOT_LOCAL_ENVIRONMENT', `the demo account is local only, and this is ${environment}`)
  }
  return createLearnerAccount(identity, DEMO_ACCOUNT)
}
