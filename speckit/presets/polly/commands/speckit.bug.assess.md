---
description: "Assess a bug report against the codebase and record the diagnosis in the bug's GitHub issue."
---

## Polly rules for this step

They take precedence over the generic instructions that follow.

- **A bug has its GitHub issue** (type `Bug`), the source of its diagnosis. No issue:
  create it first with the `intent` skill.
- **The slug is the issue number**: `BUG_DIR` is `.specify/bugs/<number>`, a cache
  ignored by git. Before anything else, rebuild it from the issue:

  ```sh
  node .specify/extensions/issue-sync/scripts/issue-sync.mjs pull <number> \
    --dir .specify/bugs/<number> --prefix bug/
  ```

- **The bug report is the issue**: the cache's `issue.md`, its description then its
  comments in order.
- **The diagnosis is written in English.** The fix does not start here: it goes
  through `/speckit-bug-fix`, which first reproduces the bug with a test.

{CORE_TEMPLATE}

## After the diagnosis

Pour the diagnosis into the issue:

```sh
node .specify/extensions/issue-sync/scripts/issue-sync.mjs push <number> \
  --dir .specify/bugs/<number> --prefix bug/ --note "diagnosis: <verdict and cause in one sentence>"
```
