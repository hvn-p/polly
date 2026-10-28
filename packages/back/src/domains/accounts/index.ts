// Learner accounts. Public sign-up is closed: an account is created on the
// server side, and only locally for a seeded one.

import { Refusal } from '@polly/platform'

export interface LearnerAccount {
  name: string
  email: string
  password: string
}

// Where accounts are created; an existing account is kept as it is.
export interface LearnerAccounts {
  // Returns the learner's id.
  create: (account: LearnerAccount) => Promise<string>
}

// Creates an account whose credentials are public: only in a local environment.
export async function createLocalAccount(
  accounts: LearnerAccounts,
  environment: string,
  account: LearnerAccount,
): Promise<string> {
  if (environment !== 'local') {
    throw new Refusal('NOT_LOCAL_ENVIRONMENT', `the demo account is local only, and this is ${environment}`)
  }
  return accounts.create(account)
}
