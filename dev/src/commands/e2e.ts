// nr dev:e2e <scenario>: plays a scenario in a driven Claude Code session
// against this worktree, then prints pass or fail and the transcript's path.

import type { RunResult } from '../e2e/claude.ts'
import { type ClientStatus, probeClaude } from '../e2e/client.ts'
import type { Scenario } from '../e2e/scenario.ts'
import { smoke } from '../e2e/scenarios/smoke.ts'
import type { Infrastructure } from '../infra/ports.ts'
import { Refusal } from './refusal.ts'
import { readEnv, readState } from './state.ts'
import { worktreeAt } from './worktree.ts'

const SCENARIOS: Record<string, Scenario> = { smoke }

export type Driver = (options: {
  root: string
  env: Record<string, string>
  scenario: Scenario
  out: (line: string) => void
}) => Promise<RunResult>

const realDriver: Driver = async (options) => {
  const { runScenario } = await import('../e2e/claude.ts')
  return runScenario(options)
}

export async function e2e({
  root,
  infra,
  scenario: name,
  out,
  client = probeClaude,
  driver = realDriver,
}: {
  root: string
  infra: Infrastructure
  scenario: string
  out: (line: string) => void
  client?: () => Promise<ClientStatus>
  driver?: Driver
}): Promise<void> {
  const status = await client()
  if (!status.installed || !status.signedIn) {
    throw new Refusal(
      'E2E_CLIENT_UNAVAILABLE',
      status.installed ? 'Claude Code is signed out; run claude auth login' : 'Claude Code is not installed',
    )
  }
  const worktree = worktreeAt(root)
  const env = readEnv(worktree)
  const { supervisor } = readState(worktree)
  if (env === undefined || supervisor === undefined || !infra.supervisor.isRunning(supervisor)) {
    throw new Refusal('WORKTREE_NOT_RUNNING', "this worktree's Polly is not running; run nr dev:up")
  }
  const scenario = SCENARIOS[name]
  if (scenario === undefined) {
    throw new Refusal('UNKNOWN_SCENARIO', `${name}; the scenarios are ${Object.keys(SCENARIOS).join(', ')}`)
  }
  const { failures, transcript } = await driver({ root, env, scenario, out })
  out(`transcript: ${transcript}`)
  if (failures.length > 0) {
    throw new Refusal('E2E_FAILED', `${scenario.name}: ${failures.join('; ')}`)
  }
  out(`PASS ${scenario.name}`)
}
