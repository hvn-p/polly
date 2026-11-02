// The log plugin (constitution XIX, research R22): resolves `@polly/platform/log`,
// for each importing file, to the socle's logger tagged with that file's tier,
// module and path, as the architecture analyzer places it. A file of a tier
// that does not log fails the build. The same resolution serves esbuild, which
// builds every Node process, and Vitest, which runs their tests.

import { join, relative } from 'node:path'
import type { Plugin } from 'esbuild'
import { type Module, readModules } from '../checks/analyzer.ts'

export { type Module, readModules }

const SPECIFIER = '@polly/platform/log'
const LOGGING_TIERS = ['interfaces', 'flows', 'adapters']
const VIRTUAL = '\0polly-log:'

// The module of a file, from the analyzer's last reading; read again when the
// file is in none, as one created or moved since is.
export type ModuleIndex = (file: string) => Module | undefined

export function moduleIndex(read: () => Module[]): ModuleIndex {
  let modules: Module[] | undefined
  return (file) => {
    const find = () => modules?.find(({ files }) => files.includes(file))
    if (modules === undefined) {
      modules = read()
      return find()
    }
    const known = find()
    if (known !== undefined) {
      return known
    }
    modules = read()
    return find()
  }
}

// The tagged logger's module for a file, or why it may not log.
function taggedLogger(root: string, modules: ModuleIndex, importer: string): string {
  const file = relative(root, importer)
  const module = modules(file)
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

export function esbuildLogPlugin(
  root: string,
  modules: ModuleIndex = moduleIndex(() => readModules(root)),
): Plugin {
  return {
    name: 'polly-log',
    setup: (build) => {
      build.onResolve({ filter: /^@polly\/platform\/log$/ }, ({ importer }) => {
        try {
          return {
            path: importer,
            namespace: 'polly-log',
            pluginData: taggedLogger(root, modules, importer),
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

export function vitestLogPlugin(root: string, modules: ModuleIndex = moduleIndex(() => readModules(root))) {
  return {
    name: 'polly-log',
    enforce: 'pre' as const,
    resolveId: (source: string, importer: string | undefined): string | undefined =>
      source === SPECIFIER && importer !== undefined ? `${VIRTUAL}${importer}` : undefined,
    load: (id: string): string | undefined =>
      id.startsWith(VIRTUAL) ? taggedLogger(root, modules, id.slice(VIRTUAL.length)) : undefined,
  }
}
