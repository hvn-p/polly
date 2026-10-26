---
description: "Apply a go / needs-clarification / kill gate and turn the verdict into the feature's GitHub issue."
---

{CORE_TEMPLATE}

## Polly rules: the verdict becomes an issue

The assessment is only worth something if it can be found again: the issue is its
source, the `.specify/assessments/<slug>/` directory is only a cache ignored by git.
The artifacts are written in English.

- **needs-clarification**: nothing to create, the assessment goes on.
- **go** or **kill**:
  1. Look for precedents (`gh issue list --state all --search "<keywords>"`). An open
     issue already covers the subject: the assessment goes into that one. A closed
     issue ruled it out: the new one says what has changed since.
  2. Write the issue following the `intent` skill (Intent, Why, Scope, Done), from
     `decision.md` and `problem.md`. Show the title and body to the user, and create
     the issue once they agree.
  3. Pour the assessment into it, one comment per artifact:

     ```sh
     node .specify/extensions/issue-sync/scripts/issue-sync.mjs push <number> \
       --dir .specify/assessments/<slug> --prefix assess/ --note "prior assessment: <verdict>"
     ```

  4. **kill** only: close the issue with its reason, never silently:
     `gh issue close <number> --reason "not planned" --comment "<decisive reason>"`.
- **go**: the next step is `/speckit-specify` on the branch
  `<issue number>-<slug>`.
