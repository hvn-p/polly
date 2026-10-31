// The log plugin (constitution XIX, research R22): resolves `@polly/platform/log`,
// for each importing file, to the socle's logger tagged with that file's tier,
// module and path, as the architecture analyzer places it. A file of a tier
// that does not log fails the build. The same resolution serves esbuild, which
// builds every Node process, and Vitest, which runs their tests.

import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'
import type { Plugin } from 'esbuild'
import { analyzerCommand } from '../checks/analyzer.ts'

export interface Module {
  id: string
  tier: string
  files: string[]
}

const SPECIFIER = '@polly/platform/log'
const LOGGING_TIERS = ['interfaces', 'flows', 'adapters']
const VIRTUAL = '\0polly-log:'

export function readModules(root: string): Module[] {
  const [command = '', ...args] = analyzerCommand(root, ['json'])
  const run = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (run.status !== 0) {
    throw new Error(`the architecture analyzer failed: ${run.stderr}`)
  }
  return (JSON.parse(run.stdout) as { modules: Module[] }).modules
}

// The tagged logger's module for a file, or why it may not log.
function taggedLogger(root: string, modules: Module[], importer: string): string {
  const file = relative(root, importer)
  const module = modules.find(({ files }) => files.includes(file))
  if (module === undefined) {
    throw new Error(`${file} is in no tier that logs (constitution XIX)`)
  }
  if (!LOGGING_TIERS.includes(module.tier)) {
    throw new Error(`${file} is in the ${module.tier} tier, which does not log (constitution XIX)`)
  }
  const source = JSON.stringify({ tier: module.tier, module: module.id, file })
  const socle = JSON.stringify(join(root, 'packages/platform/src/log.ts'))
  return `import { logFrom } from ${socle}\nexport const log = logFrom(${source})\n`
}

function lazy(read: () => Module[]): () => Module[] {
  let modules: Module[] | undefined
  return () => {
    modules ??= read()
    return modules
  }
}

export function esbuildLogPlugin(root: string, read: () => Module[] = () => readModules(root)): Plugin {
  const modules = lazy(read)
  return {
    name: 'polly-log',
    setup: (build) => {
      build.onResolve({ filter: /^@polly\/platform\/log$/ }, ({ importer }) => {
        try {
          return {
            path: importer,
            namespace: 'polly-log',
            pluginData: taggedLogger(root, modules(), importer),
          }
        } catch (error) {
          return { errors: [{ text: (error as Error).message }] }
        }
      })
      build.onLoad({ filter: /.*/, namespace: 'polly-log' }, ({ pluginData }) => ({
        contents: pluginData as string,
        resolveDir: root,
        loader: 'js',
      }))
    },
  }
}

export function vitestLogPlugin(root: string, read: () => Module[] = () => readModules(root)) {
  const modules = lazy(read)
  return {
    name: 'polly-log',
    enforce: 'pre' as const,
    resolveId: (source: string, importer: string | undefined): string | undefined =>
      source === SPECIFIER && importer !== undefined ? `${VIRTUAL}${importer}` : undefined,
    load: (id: string): string | undefined =>
      id.startsWith(VIRTUAL) ? taggedLogger(root, modules(), id.slice(VIRTUAL.length)) : undefined,
  }
}
