---
description: "Judge the feature finished from the outside: Spec Kit check, PR comments, code review, test review, security review, design review, functional and human validation."
---

## Polly rules for this step

`converge` judges the feature finished, seen from the outside. The Spec Kit check
below is only the first of eight steps; the seven others come after it, in the
"Rest of the convergence" section.

{CORE_TEMPLATE}

## Rest of the convergence

If the Spec Kit check added tasks, stop there: the next step is
`/speckit-implement`, then `/speckit-converge` again.

Otherwise, go on in this order, without changing any code (a finding becomes a task,
never a direct fix). The PR comments (step 1) are read on every pass. Each other review
(steps 2 to 5) runs if it has never run on the feature, or if the last note of
`/speckit-implement` asks for it ("Reviews to rerun", in `issue.md`). Otherwise it is
skipped, and the report says so. The closing note of `converge` names the reviews that
ran.

1. **PR comments**: a human review. Read every comment on the PR (general comments,
   reviews and the comments on lines) left unanswered since the last pass, and judge
   each one: some call for a change, some do not apply. Each change it calls for is a
   finding. Answer each comment in its own thread: what will change and in which task,
   or why it does not apply. Once the task of a comment is done, the next pass says so
   in that thread, with the commit.
2. **Code review**: `/code-review` at the level declared by the plan's "Review"
   section, without `--fix`.
3. **Test review**: `/baudrier:test-review` on the branch's tests, which reports the
   missing ones, the ones that protect nothing and the ones that would not see the
   behaviour break. The reason for each modified existing test, given in the PR
   description, is also judged at this step: missing or untenable, it is a finding.
4. **Security review**: `/security-review`, when the plan's "Review" section makes it
   mandatory.
5. **Design review**: Impeccable's finish review, for each interface the feature
   changes: the "Inspect and finish" section of the Impeccable skill
   (`reference/new-work.md`), its captures in the states that show the change, then
   the `impeccable-finish-reviewer` agent with that section's inputs (the surface's
   direction contract, the validated mockup or comp, the captures, the hook findings).
   Each material fix it returns is a finding, and so is a new design world without its
   `DESIGN.md`. No interface changed: skipped.
6. **Functional validation**: play the spec's scenarios through the real interfaces
   (browser on the web, local MCP), and put the evidence in the PR (screenshots in
   the state that shows the change, exchange with the MCP).
7. **Human validation**: present the feature to the user, open in the state that
   shows it, and wait for their verdict.

Each finding is added to `tasks.md` under a new "Convergence" phase, in the Spec Kit
check format (`<source-ref>`: `pr-comment`, `code-review`, `test-review`,
`security-review`, `design-review`, `validation`, `human`). It follows the path of its nature: a bug goes back through a
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
