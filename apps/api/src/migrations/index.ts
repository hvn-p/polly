// Every migration of the API's database, in order. A migration is never
// edited once merged: a change adds the next one.

import type { Migration } from 'kysely/migration'
import * as auth from './0001-auth.ts'

export const migrations: Record<string, Migration> = {
  '0001_auth': auth,
}
