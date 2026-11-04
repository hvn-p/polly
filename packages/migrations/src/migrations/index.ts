// Every migration of Polly's database, in order. A migration is never
// edited once merged: a change adds the next one.

import type { Migration } from 'kysely/migration'
import * as auth from './0001-auth.ts'
import * as agentEventCode from './0002-agent-event-code.ts'

export const migrations: Record<string, Migration> = {
  '0001_auth': auth,
  '0002_agent_event_code': agentEventCode,
}
