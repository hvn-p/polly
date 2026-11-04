// The demo account of a local worktree: a learner whose credentials are public
// (dev/README.md), so an agent can sign in through the real flow. Each feature
// that adds a domain extends this flow with that domain's data.

import { createLocalAccount, type LearnerAccounts } from '../../domains/accounts/index.ts'

export const DEMO_ACCOUNT = {
  name: 'Demo Learner',
  email: 'demo@polly.localhost',
  password: 'polly-demo-learner',
}

// Returns the demo learner's id; an existing account is kept as it is.
export function seedDemoAccount({
  accounts,
  environment,
}: {
  accounts: LearnerAccounts
  environment: string
}): Promise<string> {
  return createLocalAccount(accounts, environment, DEMO_ACCOUNT)
}
