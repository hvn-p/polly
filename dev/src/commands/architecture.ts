// dev:architecture source | package: restarts the worktree's architecture
// view from its sources, built in a container, or from the version the
// repository pins. dev:up always starts the pinned version: the agent that
// changes the analyzer or its view asks for its sources (research R19).

import { Refusal } from '@polly/platform'
import { lock } from '../machine/index.ts'
import type { Infrastructure } from '../ports/index.ts'
import { readEnv, readState, required, resourcesOf, worktreeAt, writeState } from '../worktree/index.ts'

const SOURCES = ['source', 'package'] as const
type Source = (typeof SOURCES)[number]

// Starts the view's project; whether it is served, and the line that says
// where, or why it is not.
export async function startView(
  root: string,
  infra: Infrastructure,
  name: string,
  from: Source,
): Promise<{ served: boolean; line: string }> {
  const env = readEnv(worktreeAt(root)) ?? {}
  const { architectureHost } = resourcesOf(env)
  const served = await infra.architecture.start(name, {
    root,
    port: Number(required(env, 'POLLY_ARCH_PORT')),
    host: architectureHost,
    from,
  })
  return served === 'served'
    ? { served: true, line: `architecture view: https://${architectureHost}` }
    : {
        served: false,
        line: "ARCHITECTURE_VIEW_UNAVAILABLE: the pinned @hvn-p/architecture holds no view; nr dev:architecture source serves it from this worktree's sources",
      }
}

export async function architecture({
  root,
  infra,
  from,
  out,
  warn,
}: {
  root: string
  infra: Infrastructure
  from: string
  // stdout: the view's URL.
  out: (line: string) => void
  // stderr: why it is not served.
  warn: (line: string) => void
}): Promise<void> {
  if (!SOURCES.includes(from as Source)) {
    throw new Refusal('UNKNOWN_ARCHITECTURE_SOURCE', `${from}; the sources are ${SOURCES.join(', ')}`)
  }
  const worktree = worktreeAt(root)
  const env = readEnv(worktree)
  if (env === undefined) {
    throw new Refusal('WORKTREE_NOT_CONFIGURED', 'this worktree has no .env.local; run nr dev:up')
  }
  // Waits for a dev:up or dev:down running in this worktree.
  const held = await lock(worktree.upLock)
  try {
    const name = infra.architecture.projectOf(required(env, 'POLLY_WORKTREE_ID'))
    writeState(worktree, { ...readState(worktree), architecture: name })
    const { served, line } = await startView(root, infra, name, from as Source)
    ;(served ? out : warn)(line)
  } finally {
    await held.release()
  }
}
