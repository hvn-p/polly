---
description: "Execute the implementation planning workflow, declaring the review level and the constitution deviations."
---

## Polly rules for this step

They take precedence over the generic instructions that follow.

- **The feature directory is the cache of its issue**, rebuilt by the `before_plan`
  hook. The plan and its companions (`research.md`, `data-model.md`, `contracts/`,
  `quickstart.md`) are written there and join the issue after the step.
- **The plan is written in English.**
- **"Test strategy" section**: for each case in "Cases and refusals", the lowest
  level that genuinely exercises it (pure domain computation, API module against the
  database, API route through its contract, in-process MCP tool, audio analysis on
  reference recordings, screen), the data the tests add, and what cannot be
  automated together with how it is validated. Tasks and their tests start from it;
  a case without a level is an incomplete plan.
- **"Review" section**: the effort level of `/code-review` according to the size of
  the feature, and whether `/security-review` is mandatory, with the reason. It is
  mandatory as soon as the feature adds an input field, a route, an access rule, a
  secret or a dependency.
- **"Constitution deviations" section**: each principle of
  `.specify/memory/constitution.md` is checked against what the feature changes. A
  deviation in the touched code (the function, route or table changed) blocks: the
  plan fixes it, or stops and proposes doing the convergence first. A known deviation
  in untouched code is listed with the convergence issue that carries it; without an
  issue, propose one.
- Before touching a domain action, read the API module that carries it: the header
  comment of its service is the contract.

{CORE_TEMPLATE}
