# polly

Language-learning web app whose teacher is the learner's AI agent, connected through
the MCP.

## Read before acting

- **The constitution** (`.specify/memory/constitution.md`) holds the principles an agent
  follows when it specifies, plans, writes or judges code, each with its check. Read it
  before designing or judging a change.
- **The product direction** and its teaching principles are in `PRODUCT.md`. An
  interface is composed with the Impeccable skill, which reads it.

## Where a decision is written

Each thing has one place and one only: two files that say the same thing end up
contradicting each other, and the stale one is the one believed.

| What was just decided | Where it is written |
|---|---|
| A principle an agent follows when writing or judging code | The constitution |
| The product direction, a teaching principle | `PRODUCT.md` |
| A code rule specific to one part of the repository | The `AGENTS.md` closest to what it governs |
| What a feature must do: spec, plan | Its issue, one comment per Spec Kit artifact |
| How it is done: the tasks | Its PR description |
| The story: what was measured, ruled out, what caused what | The issue |

These files describe the current state, in the present tense: no date or issue number
standing in for history, no inventory of what exists. A decision that corrects another
replaces it. A pointer to an open issue stays legitimate.

## Issues and the feature cycle

Every intent is tracked as a GitHub issue, even when nobody tackles it right away.
Before working on a subject, look for its precedents, open and closed
(`gh issue list --state all --search …`).

A feature follows the Spec Kit cycle adapted to the repository: `/speckit-specify`,
`/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-converge`. A still
vague idea goes through `/speckit-assess-intake` first. A bug goes through
`/speckit-bug-assess` then `/speckit-bug-fix`. The branch is named
`<issue number>-<slug>`, and its PR closes the issue.

**Reading a feature**:

- the issue body carries the intent;
- an issue comment starting with `<!-- speckit-artifact: … -->` is an artifact (spec,
  plan…) and is authoritative: the local cache, ignored by git, is only a copy rebuilt
  at each step;
- the tasks are in the PR description, between the `speckit-tasks` markers;
- comments are read in order: when two decisions contradict each other, the most
  recent wins.

**Write consent**: Spec Kit commands write to the issue and PR of the current feature,
through the `issue-sync` extension, and open that PR as a draft, without asking. The
consent covers only those two and that channel: any other issue or PR is asked for.

## Stack

- **Separate React front end and Hono 4 API**, in a pnpm monorepo. The API is also the
  MCP's OAuth authorization server, through Better Auth (`mcp` and `cimd` plugins),
  which polly's code only reaches through its extension points.
- **TypeScript 7 only**, compiled by `tsc`.
- **Biome** for lint and format.
- **Boundaries**: Zod schemas, an OpenAPI contract generated from them, a generated
  client through which the front end and the MCP go. A refusal that depends on state
  comes back as a named error code.
- **Postgres**: the shared instance of the pikmine platform, reached only through
  `DATABASE_URL`.
- **Audio analysis** is a separate Python service, on CPU. No analysis runs inside an
  HTTP request: the API answers at once and the result arrives through the event
  stream.

## Layout

- The API (`apps/api/src`) is split into tiers, each importing only those below it:
  `entry` (Hono routes, SSE, MCP, composition root), `flows` (one use case per file,
  DBOS workflows included), `domains`, `reference` (read-only language packs, identity),
  `kernel` (ids, language code, score, clock; no domain rule).
- The domains are `learner-memory`, `session-log`, `catalogue`, `evaluation` and
  `audio`. No domain imports another, no flow imports another, and a module is imported
  through its index file only. Review enforces this until a dependency check exists.
- A domain that needs another domain's data declares a port it owns, and a flow feeds
  it. Domains share events only through the session log: no in-process event bus.
- The front end (`apps/web`) follows the Feature-Sliced Design layers.
- Outside the apps: `services/pron-worker` (Python audio analysis), `languages/<code>/`
  (language packs as neutral data, read by the API and the worker),
  `packages/api-client` (client generated from the OpenAPI, for the front end and the
  plugin), `plugin/` (the Claude Code plugin).

## Workflow

- Everything written in the repository and on GitHub (code, comments, docs, issues,
  PRs, commits, Spec Kit artifacts) is in English; only the product interface is
  translated.
- Everything goes through a PR; no direct commit on `main`.
- Run `nr lint` without a pipe before committing: `| tail` hides its exit code.
- After a finding that could recur beyond the current work (a review, a validation,
  human feedback), ask what would have prevented it: a check first, otherwise a rule
  in the nearest `AGENTS.md`, otherwise nothing.
- When a change removes the cause of such a rule (a check covers it, the code has
  changed), update or remove the rule.
