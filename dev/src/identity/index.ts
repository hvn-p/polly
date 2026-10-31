// A worktree's identity and the names of the resources derived from it. The
// identity is derived once from the branch, then recorded in .env.local, so
// renaming the branch never changes which resources belong to the worktree.

import { createHash } from 'node:crypto'

const MAX_LENGTH = 40

export interface ResourceNames {
  database: string
  testDatabase: string
  role: string
  bucket: string
  host: string
}

// Lowercase, `[a-z0-9-]`, dashes collapsed and trimmed, cut at 40 characters,
// plus a 4-character hash of the full branch whenever the result differs from
// it, so two branches never share an identity. At most 45 characters.
export function deriveIdentity(branch: string): string {
  const base = branch
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '')
  if (base === branch) {
    return base
  }
  const hash = createHash('sha256').update(branch).digest('hex').slice(0, 4)
  return base === '' ? hash : `${base}-${hash}`
}

// An identity never holds two dashes in a row, so a suffix after a double
// separator (`__test`, `--release`) never turns one identity's name into
// another's: `x`'s test database is not the database of `x-test`.
export function resourceNames(identity: string): ResourceNames {
  const underscored = identity.replaceAll('-', '_')
  return {
    database: `polly_${underscored}`,
    testDatabase: `polly_${underscored}__test`,
    role: `polly_${underscored}`,
    bucket: `polly-${identity}`,
    host: `${identity}.polly.localhost`,
  }
}

// The Garage key dev:down creates to empty a bucket before deleting it.
export function releaseKeyOf(bucket: string): string {
  return `${bucket}--release`
}
