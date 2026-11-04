// A scenario a driven Claude Code session plays against a worktree: what the
// learner says, and what the session transcript must show.
export interface Scenario {
  name: string
  prompt: string
  // Whether the transcript shows the scenario finished, pass or fail.
  done: (transcript: string) => boolean
  // What the transcript misses; empty when the scenario passes.
  failures: (transcript: string) => string[]
}
