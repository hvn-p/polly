// The end-to-end run: the probes of what it needs, its scenarios, and the
// driver, loaded only when a run starts.

import type { RunResult } from './claude.ts'

export type { RunResult } from './claude.ts'
export { type ClientStatus, probeClaude, probeDriverTools } from './client.ts'
export type { Scenario } from './scenario.ts'
export { smoke } from './scenarios/smoke.ts'

export async function runScenario(
  options: Parameters<typeof import('./claude.ts').runScenario>[0],
): Promise<RunResult> {
  const { runScenario: run } = await import('./claude.ts')
  return run(options)
}
