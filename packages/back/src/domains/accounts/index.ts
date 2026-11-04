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

// Where a learner's name is read.
export interface LearnerDirectory {
  // Undefined once the account is gone.
  nameOf: (learnerId: string) => Promise<string | undefined>
}

// A learner as shown to them: refused when their account is gone, since the
// credential that named them then speaks for no one.
export async function describe(
  directory: LearnerDirectory,
  learnerId: string,
): Promise<{ learnerId: string; name: string }> {
  const name = await directory.nameOf(learnerId)
  if (name === undefined) {
    throw new Refusal('UNAUTHORIZED', 'this account no longer exists')
  }
  return { learnerId, name }
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
