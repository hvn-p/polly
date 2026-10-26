## Test strategy *(mandatory)*

<!--
  Each case in "Cases and refusals" has its test level, chosen here before any task:
  the lowest one that genuinely exercises it. Levels: pure domain computation, API
  module against the database, API route through its contract, in-process MCP tool,
  audio analysis on reference recordings, screen. What cannot be tested automatically
  says how it is validated (converge's functional validation).
-->

| Case | Level | What the test exercises |
|---|---|---|
| C1 | [module] | [the action, the starting state, what is checked] |

- **Data**: [what the tests add to their starting data sets; what the demo data set
  gains for functional validation]
- **Outside automation**: [case, and how it is validated]

## Review *(mandatory)*

- **`/code-review`**: level `[low | medium | high | xhigh | max]`, chosen according to the
  size of the feature and what it touches. [One sentence: why this level.]
- **`/security-review`**: [mandatory | not required]. [The reason: an input field, a
  route, an access rule, a secret or a dependency added makes it mandatory.]

A human or an agent may raise these levels along the way; the change is made here,
with its reason.

## Constitution deviations *(mandatory)*

<!--
  A deviation in what the feature changes (the function, route or table touched)
  blocks: it is fixed in this PR, or the convergence is done first. An already known
  deviation in code the feature does not touch is listed with the convergence issue
  that carries it. Write "None" rather than leaving it empty.
-->

| Principle | Where | Handling |
|---|---|---|
| [e.g. V] | [file, function] | [fixed in this PR / out of scope, issue #] |
