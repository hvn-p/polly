## Cases and refusals *(mandatory)*

<!--
  What the tests derive from: whoever writes the tests guesses nothing. One row per
  behaviour, per edge case and per refusal, with a stable identifier that the plan
  and the tasks cite. A refusal names its error code, a bound is tested on both
  sides.
-->

| Id | Situation | Expected result |
|---|---|---|
| C1 | [precise input or state] | [what is recorded or displayed] |
| C2 | [refused input] | Refusal `[ERROR_CODE]`: [what the interface says about it] |
| C3 | [bound: just inside / just outside] | [accepted / refused with its code] |
