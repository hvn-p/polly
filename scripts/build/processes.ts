// Builds every Node process into one ESM file for Node 24, run in development
// as in production (research R16): Node strips no types under node_modules,
// where a deployed process receives its workspace packages. `nr build` builds
// them, `--watch` rebuilds on each change; the processes run their output.
//
// Usage: node scripts/build/processes.ts [--watch] [name...]

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { type BuildOptions, build, context, type Plugin } from 'esbuild'

export interface Process {
  name: string
  // Paths from the repository root.
  entry: string
  output: string
  // A dev command, run in a checkout only: its modules keep their source
  // directories. A deployed process bundles nothing of dev/.
  development?: true
}

export const PROCESSES: Process[] = [
  { name: 'api', entry: 'apps/api/src/main.ts', output: 'apps/api/dist/main.js' },
  { name: 'api-cli', entry: 'apps/api/src/cli.ts', output: 'apps/api/dist/cli.js' },
  { name: 'mcp', entry: 'apps/mcp/src/main.ts', output: 'apps/mcp/dist/main.js' },
  { name: 'worker', entry: 'apps/worker/src/main.ts', output: 'apps/worker/dist/main.js' },
  { name: 'migrations', entry: 'packages/migrations/src/cli.ts', output: 'packages/migrations/dist/cli.js' },
  { name: 'dev', entry: 'dev/src/main.ts', output: 'dev/dist/main.js', development: true },
  {
    name: 'dev-supervisor',
    entry: 'dev/src/supervisor/main.ts',
    output: 'dev/dist/supervisor.js',
    development: true,
  },
]

const repositoryRoot = join(import.meta.dirname, '..', '..')

// The dependencies the process's own package declares: installed next to it,
// they stay imports; what the workspace packages use is bundled.
function declaredDependencies(entry: string): string[] {
  let directory = dirname(entry)
  while (!existsSync(join(directory, 'package.json'))) {
    if (dirname(directory) === directory) {
      return []
    }
    directory = dirname(directory)
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return Object.entries(manifest.dependencies ?? {})
    .filter(([, version]) => !version.startsWith('workspace:'))
    .map(([name]) => name)
}

// In a dev command, each module keeps its source directory, so a path it
// builds from import.meta.dirname still names the file it meant; only the
// entry's import.meta.filename is the bundle's, which `node <bundle>` puts in
// argv[1].
function sourcePaths(entry: string, outfile: string): Plugin {
  return {
    name: 'source-paths',
    setup: (pluginBuild) => {
      pluginBuild.onLoad({ filter: /\.ts$/ }, (args) => {
        const fromOutput = (path: string) => JSON.stringify(relative(dirname(outfile), path))
        let contents = readFileSync(args.path, 'utf8').replaceAll(
          'import.meta.dirname',
          `__sourcePath(${fromOutput(dirname(args.path))})`,
        )
        if (args.path !== entry) {
          contents = contents.replaceAll('import.meta.filename', `__sourcePath(${fromOutput(args.path)})`)
        }
        return { contents, loader: 'ts' }
      })
    },
  }
}

interface Paths {
  entry: string
  outfile: string
  development?: boolean
}

function options({ entry, outfile, development = false }: Paths): BuildOptions {
  const banner = [
    "import { createRequire as __createRequire } from 'node:module'",
    // A CommonJS dependency bundled into ESM still finds require.
    'const require = __createRequire(import.meta.url)',
    ...(development
      ? [
          "import { join as __join } from 'node:path'",
          'const __sourcePath = (path) => __join(import.meta.dirname, path)',
        ]
      : []),
  ]
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: true,
    metafile: true,
    external: declaredDependencies(entry).flatMap((name) => [name, `${name}/*`]),
    banner: { js: banner.join('\n') },
    plugins: development ? [sourcePaths(entry, outfile)] : [],
    logLevel: 'warning',
  }
}

// Builds a process; resolves with the source files it bundled.
export async function bundleProcess(paths: Paths): Promise<string[]> {
  const { metafile } = await build(options(paths))
  return Object.keys(metafile?.inputs ?? {})
}

// Rebuilds a process on every change to its sources, until killed.
export async function watchProcess(paths: Paths): Promise<void> {
  await (await context(options(paths))).watch()
}

export function selected(names: string[]): Process[] {
  const unknown = names.filter((name) => !PROCESSES.some((process) => process.name === name))
  if (unknown.length > 0) {
    throw new Error(
      `unknown process ${unknown.join(', ')}; the processes are ${PROCESSES.map(({ name }) => name).join(', ')}`,
    )
  }
  return names.length === 0 ? PROCESSES : PROCESSES.filter(({ name }) => names.includes(name))
}

export function pathsOf({ entry, output, development }: Process): Paths {
  return {
    entry: join(repositoryRoot, entry),
    outfile: join(repositoryRoot, output),
    ...(development === undefined ? {} : { development }),
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const watch = process.argv[2] === '--watch'
  for (const target of selected(process.argv.slice(watch ? 3 : 2))) {
    await (watch ? watchProcess(pathsOf(target)) : bundleProcess(pathsOf(target)))
  }
}
