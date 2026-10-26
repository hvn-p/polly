---
description: "Generate the dependency-ordered tasks of the feature as batches that each carry their tests, kept in its pull request."
---

## Polly rules for this step

They take precedence over the generic instructions that follow.

- **The tasks live in the description of the feature's PR**, in a section that
  `issue-sync` keeps up to date; the cache's `tasks.md` is only a copy. Before ending
  the step (and therefore before the `after_tasks` hook), open the PR as a draft if
  the branch has none:

  ```sh
  git commit --allow-empty -m "chore: open <issue number>"   # only if the branch has no commit
  git push -u origin HEAD
  gh pr create --draft --title "<issue title>" --body "Closes #<issue number>"
  ```

- **Each code task is a batch that carries its tests**: it cites the cases from
  "Cases and refusals" it covers and their test level, taken from the plan's "Test
  strategy". Never a separate "write the tests" task: at implementation, each task
  writes its tests before its code. The full rules are at the end of the tasks
  template.
- Every case in "Cases and refusals" is covered by at least one task; a case without
  a task is a hole in the plan, to be fixed before going on.
- The demo data set grows within the same feature as soon as it adds something to
  display: that is a task.

{CORE_TEMPLATE}
