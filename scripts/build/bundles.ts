// The bundles committed with the repository: the plugin's monitor, which
// Claude Code copies as is and installs nothing for (research R10). esbuild
// writes each from its sources and the workspace packages they import;
// `nr bundles` rewrites them, scripts/checks/bundles.mjs fails when a copy
// differs.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { build } from 'esbuild'

export interface Bundle {
  // Paths from the repository root.
  entry: string
  output: string
}

export const BUNDLES: Bundle[] = [
  { entry: 'plugin/src/agent-events.ts', output: 'plugin/monitors/agent-events.mjs' },
]

const repositoryRoot = join(import.meta.dirname, '..', '..')

// The bundle of an entry, from the repository's sources.
export async function bundle({ entry }: Bundle): Promise<string> {
  const result = await build({
    absWorkingDir: repositoryRoot,
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    legalComments: 'none',
    write: false,
  })
  return result.outputFiles[0]?.text ?? ''
}

export async function writeBundles(root: string, bundles: Bundle[] = BUNDLES): Promise<void> {
  for (const entry of bundles) {
    mkdirSync(dirname(join(root, entry.output)), { recursive: true })
    writeFileSync(join(root, entry.output), await bundle(entry))
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  await writeBundles(repositoryRoot)
}
