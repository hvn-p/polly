import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundleProcess, PROCESSES, pathsOf } from './processes.ts'

const repositoryRoot = join(import.meta.dirname, '..', '..')

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'build-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

describe('building a Node process', () => {
  it("bundles the workspace's code and leaves the installed packages to node_modules", async () => {
    const out = mkdtempSync(join(tmpdir(), 'build-out-'))
    const mcp = PROCESSES.find(({ name }) => name === 'mcp')
    await bundleProcess({ entry: join(repositoryRoot, mcp?.entry ?? ''), outfile: join(out, 'main.js') })
    const bundle = readFileSync(join(out, 'main.js'), 'utf8')
    expect(bundle).not.toMatch(/from ["']@polly\//)
    expect(bundle).toMatch(/from ["']@modelcontextprotocol\/server["']/)
  })

  it('bundles nothing of dev/ into a deployed process, and leaves its paths alone', async () => {
    const out = mkdtempSync(join(tmpdir(), 'build-out-'))
    for (const target of PROCESSES.filter(({ development }) => development === undefined)) {
      const inputs = await bundleProcess({ ...pathsOf(target), outfile: join(out, `${target.name}.js`) })
      expect(inputs.filter((input) => input.startsWith('dev/'))).toEqual([])
      expect(readFileSync(join(out, `${target.name}.js`), 'utf8')).not.toContain('__sourcePath')
    }
  })

  it('bundles neither the demo account nor its seed into a deployed process', async () => {
    const out = mkdtempSync(join(tmpdir(), 'build-out-'))
    for (const target of PROCESSES.filter(({ development }) => development === undefined)) {
      await bundleProcess({ ...pathsOf(target), outfile: join(out, `${target.name}.js`) })
      const bundle = readFileSync(join(out, `${target.name}.js`), 'utf8')
      expect(bundle, target.name).not.toContain('demo@polly.localhost')
      expect(bundle, target.name).not.toContain('seedDemoAccount')
    }
  })

  it('leaves an unchanged output unwritten, so a process that watches it is not restarted', async () => {
    const root = fixture({ 'src/main.ts': 'console.log(1)\n' })
    const paths = { entry: join(root, 'src', 'main.ts'), outfile: join(root, 'dist', 'main.js') }
    const written = () => [paths.outfile, `${paths.outfile}.map`].map((path) => statSync(path).mtimeMs)
    await bundleProcess(paths)
    const first = written()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await bundleProcess(paths)
    expect(written()).toEqual(first)
    writeFileSync(paths.entry, 'console.log(2)\n')
    await bundleProcess(paths)
    expect(written()[0]).toBeGreaterThan(first[0] ?? 0)
    expect(readFileSync(paths.outfile, 'utf8')).toContain('console.log(2)')
  })

  it('run twice on the real processes, the script leaves their outputs unwritten the second time', () => {
    const outputs = PROCESSES.filter(({ output }) => /^apps\/[^/]+\/dist\/main\.js$/.test(output)).map(
      ({ name, output }) => ({ name, path: join(repositoryRoot, output) }),
    )
    expect(outputs.map(({ name }) => name)).toEqual(['api', 'mcp', 'worker'])
    const build = () =>
      execFileSync(process.execPath, ['scripts/build/processes.ts', ...outputs.map(({ name }) => name)], {
        cwd: repositoryRoot,
        stdio: 'pipe',
      })
    const written = () => outputs.map(({ path }) => [statSync(path).mtimeMs, statSync(`${path}.map`).mtimeMs])
    build()
    const first = written()
    build()
    expect(written()).toEqual(first)
  }, 60_000)

  it('keeps each module of a dev command on its source directory, and only the entry on the bundle', async () => {
    const root = fixture({
      'src/lib/where.ts': [
        'export const here = import.meta.dirname',
        'export const file = import.meta.filename',
        'export const main = process.argv[1] === import.meta.filename',
      ].join('\n'),
      'src/main.ts': [
        "import { file, here, main } from './lib/where.ts'",
        'process.stdout.write(JSON.stringify({ here, file, main, entry: process.argv[1] === import.meta.filename }))',
      ].join('\n'),
    })
    const outfile = join(root, 'dist', 'main.js')
    await bundleProcess({ entry: join(root, 'src', 'main.ts'), outfile, development: true })
    expect(JSON.parse(execFileSync(process.execPath, [outfile], { encoding: 'utf8' }))).toEqual({
      here: join(root, 'src', 'lib'),
      file: join(root, 'src', 'lib', 'where.ts'),
      main: false,
      entry: true,
    })
  })

  it('names every process the supervisor and the dev commands run, each with its output', () => {
    expect(PROCESSES.map(({ name, output }) => `${name} ${output}`)).toEqual([
      'api apps/api/dist/main.js',
      'api-cli apps/api/dist/cli.js',
      'mcp apps/mcp/dist/main.js',
      'worker apps/worker/dist/main.js',
      'migrations packages/migrations/dist/cli.js',
      'dev dev/dist/main.js',
      'dev-supervisor dev/dist/supervisor.js',
    ])
  })
})
