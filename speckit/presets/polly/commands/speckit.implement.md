---
description: "Execute the implementation plan, every code task writing its tests before its code."
---

## Polly rules for this step

They take precedence over the generic instructions that follow, in particular over
steps 4, 6 and 7.

- **A code task writes its tests before its code**, in the same session: the tests
  of the cases it cites (rows of "Cases and refusals" in `spec.md`), at the level the
  "Test strategy" of `plan.md` gives them, run and seen failing for the expected
  reason; then the code that makes them pass. A task marked "(no code)" is done
  directly.
- **An existing test only changes for a reason of its own**, written in the PR
  description, outside the tasks section, never in a file of the repository.
- **A deviation from the plan or a contract, once agreed, updates that artifact in the
  same batch**: the plan, research or contract in the cache changes with the code and is
  pushed with the batch's commit, so `converge` finds no stale artifact.
- **Do not create or complete any ignore file** (step 4): this repository maintains
  them itself, and a task that needs one says so.
- Finished tasks are checked in the cache's `tasks.md`, and each commit is followed by
  `/speckit-issue-sync-push`, which sends them back to the PR description: the PR
  shows how far the implementation has got, even when the step is interrupted. The
  `after_implement` hook does the last push.
- The full suite and whole-repository checks run in CI: locally, only the tests of
  what was changed.
- **At the end of the step, say which reviews to rerun**, when `converge` has already
  run some. Code review, test review, security review and design review are each
  judged separately. A review already done is only redone if the step produced code it
  has not read, and in quantity: a module, a flow or an interface rewritten; for
  security, a new surface (authentication, input, dependency, route); for design, a
  view, a page or a component added or recomposed, not a wording or a colour. Fixing a review's findings, or touching
  up a small part of the code, reruns nothing: rereading already reviewed code finds
  ever finer details and never ends. When in doubt, none. The verdict, with its
  reason, goes in the note of the last `/speckit-issue-sync-push`: "Reviews to rerun:
  none", or "Reviews to rerun: code (the authorization flow was rewritten)".

{CORE_TEMPLATE}
