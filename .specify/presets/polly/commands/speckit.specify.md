---
description: "Create or update the feature specification from the feature's GitHub issue."
---

## Polly rules for this step

They take precedence over the generic instructions that follow.

- **The feature starts from its GitHub issue**, which is the source of all its
  artifacts. No issue: stop and have it created first (skill `intent`).
- **The feature directory is the cache of the issue** that the `before_specify` hook
  (`issue-sync pull`) has just rebuilt, under `.specify/tmp/`. It is the value of
  `SPECIFY_FEATURE_DIRECTORY` at step 3: create nothing under `specs/`. No branch is
  created here; it is named `<issue number>-<slug>`.
- **The feature description is the issue** (`issue.md` in the cache: Intent, Why,
  Scope, Done, then its comments in order, the most recent decision winning),
  completed by what the user typed. If the cache holds a prior assessment
  (`assess/`), the spec starts from it.
- **The spec is written in English**, like the issues.
- **The "Cases and refusals" section is filled in completely**: every behaviour,
  every refusal with its named error code, every bound tested on both sides.
  Whatever remains open is marked `[NEEDS CLARIFICATION]` there, never guessed.

{CORE_TEMPLATE}
