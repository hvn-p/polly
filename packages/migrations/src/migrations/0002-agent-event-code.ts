// The event codes bound to learners: the stub agent-event stream knows a
// learner by them. Only a code's SHA-256 is stored; an unbound code is stored
// nowhere.

import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table agent_event_code (
      code_hash text primary key,
      learner_id text not null references "user" ("id") on delete cascade,
      bound_at timestamptz not null default now(),
      revoked_at timestamptz
    )
  `.execute(db)
  await sql`create index agent_event_code_learner_id_idx on agent_event_code (learner_id)`.execute(db)
}
