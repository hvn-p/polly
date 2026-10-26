---
description: "Judge the feature finished from the outside: Spec Kit check, code review, test review, security review, functional and human validation."
---

## Polly rules for this step

`converge` judges the feature finished, seen from the outside. The Spec Kit check
below is only the first of six steps; the five others come after it, in the
"Rest of the convergence" section.

{CORE_TEMPLATE}

## Rest of the convergence

If the Spec Kit check added tasks, stop there: the next step is
`/speckit-implement`, then `/speckit-converge` again.

Otherwise, go on in this order, without changing any code (a finding becomes a task,
never a direct fix). Each review (steps 1 to 3) runs if it has never run on the
feature, or if the last note of `/speckit-implement` asks for it ("Reviews to rerun",
in `issue.md`). Otherwise it is skipped, and the report says so. The closing note of
`converge` names the reviews that ran.

1. **Code review**: `/code-review` at the level declared by the plan's "Review"
   section, without `--fix`.
2. **Test review**: `/baudrier:test-review` on the branch's tests, which reports the
   missing ones, the ones that protect nothing and the ones that would not see the
   behaviour break. The reason for each modified existing test, given in the PR
   description, is also judged at this step: missing or untenable, it is a finding.
3. **Security review**: `/security-review`, when the plan's "Review" section makes it
   mandatory.
4. **Functional validation**: play the spec's scenarios through the real interfaces
   (browser on the web, local MCP), and put the evidence in the PR (screenshots in
   the state that shows the change, exchange with the MCP).
5. **Human validation**: present the feature to the user, open in the state that
   shows it, and wait for their verdict.

Each finding is added to `tasks.md` under a new "Convergence" phase, in the Spec Kit
check format (`<source-ref>`: `code-review`, `test-review`, `security-review`,
`validation`, `human`). It follows the path of its nature: a bug goes back through a
test that reproduces it, then the fix; a quality defect changes the code without
touching the tests; a missing or weak test is completed; a wrong plan goes back
through the spec and the plan first, then the tests.
Then send the tasks back to the PR description (`/speckit-issue-sync-push`), and
resume `/speckit-implement` then `/speckit-converge`. For functional and human
validation: after a small touch-up, revalidate what was touched; after a structural
change, everything.

The feature is "converged" only when none of the steps that ran finds anything more.

**Continuous improvement**: for each finding that could recur beyond this feature,
ask what would have prevented it (a check first, otherwise a rule in the nearest
`AGENTS.md`, otherwise nothing) and propose it. A rule whose cause has gone is updated
or removed.
