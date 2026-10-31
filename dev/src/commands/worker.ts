// dev:worker real [--compute <fingerprint>] | fake: restarts the worktree's
// worker with the given analyzer. In real mode it calls the machine's compute
// service for the worktree's fingerprint of services/compute, or the one
// given, started when needed.

import { readFileSync, writeFileSync } from 'node:fs'
import { Refusal } from '@polly/platform'
import { lock } from '../machine/index.ts'
import type { ComputeService, Infrastructure, SupervisorState } from '../ports/index.ts'
import {
  digestOf,
  readEnv,
  readState,
  required,
  type Worktree,
  worktreeAt,
  writeState,
} from '../worktree/index.ts'

const MODES = ['real', 'fake']

// Writes the values into .env.local, adding the keys it lacks, and returns
// the configuration as it now is.
export function setEnv(worktree: Worktree, values: Record<string, string>): Record<string, string> {
  let content = readFileSync(worktree.envFile, 'utf8')
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^${key}=.*$`, 'm')
    content = line.test(content)
      ? content.replace(line, `${key}=${value}`)
      : `${content.replace(/\n?$/, '\n')}${key}=${value}\n`
  }
  writeFileSync(worktree.envFile, content)
  return readEnv(worktree) ?? {}
}

// The compute service of a worktree in real mode: the one of its own
// fingerprint unless it names another. Says when the worker calls another
// version than the worktree's sources, or when the worktree runs a service of
// its own.
export async function useCompute(
  root: string,
  infra: Infrastructure,
  identity: string,
  warn: (line: string) => void,
  fingerprint?: string,
): Promise<{ fingerprint: string; service: ComputeService; env: Record<string, string> }> {
  const own = await infra.compute.fingerprintOf(root)
  const target = fingerprint ?? own
  const service = await infra.compute.use(target, identity, target === own ? root : undefined)
  if (target !== own) {
    warn(
      `COMPUTE_VERSION_MISMATCH: the worker calls the compute service ${target}; this worktree's is ${own}`,
    )
  } else if (service.started && service.others.length > 0) {
    warn(
      `compute: this worktree runs its own service, ${own}, built from its sources; the machine also runs ${service.others.join(', ')}`,
    )
  }
  return {
    fingerprint: target,
    service,
    env: { POLLY_COMPUTE_URL: service.url, POLLY_COMPUTE_FINGERPRINT: own },
  }
}

export async function worker({
  root,
  infra,
  mode,
  compute,
  out,
  warn,
}: {
  root: string
  infra: Infrastructure
  mode: string
  // The fingerprint of the compute service to call, in real mode.
  compute?: string
  // stdout: the mode the worker now runs in.
  out: (line: string) => void
  // stderr: warnings.
  warn: (line: string) => void
}): Promise<void> {
  if (!MODES.includes(mode)) {
    throw new Refusal('UNKNOWN_WORKER_MODE', `${mode}; the modes are ${MODES.join(', ')}`)
  }
  const worktree = worktreeAt(root)
  const env = readEnv(worktree)
  if (env === undefined) {
    throw new Refusal('WORKTREE_NOT_CONFIGURED', 'this worktree has no .env.local; run nr dev:up')
  }
  const identity = required(env, 'POLLY_WORKTREE_ID')
  // Waits for a dev:up or dev:down running in this worktree.
  const held = await lock(worktree.upLock)
  try {
    const state = readState(worktree)
    if (state.supervisor === undefined || !infra.supervisor.isRunning(state.supervisor)) {
      throw new Refusal('WORKTREE_NOT_RUNNING', "this worktree's Polly is not running; run nr dev:up")
    }
    const used = mode === 'real' ? await useCompute(root, infra, identity, warn, compute) : undefined
    const updated = setEnv(worktree, { ...used?.env, POLLY_WORKER_MODE: mode })
    if (state.compute !== undefined && state.compute !== used?.fingerprint) {
      await infra.compute.release(state.compute, identity)
    }
    // Recorded before the supervisor starts: if it fails, dev:down still
    // releases the service this worktree now uses, and only that one.
    const { compute: _, ...rest } = readState(worktree)
    writeState(worktree, { ...rest, ...(used === undefined ? {} : { compute: used.fingerprint }) })
    await infra.supervisor.stop(state.supervisor)
    const processes = infra.application.processes(updated)
    const supervisor: SupervisorState = await infra.supervisor.start({ root, processes, env: updated })
    writeState(worktree, { ...readState(worktree), supervisor, processes: digestOf(processes, updated) })
    out(`worker: ${mode}`)
  } finally {
    await held.release()
  }
}
