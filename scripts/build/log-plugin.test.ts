import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'
import { esbuildLogPlugin, type Module, readModules, vitestLogPlugin } from './log-plugin.ts'

const repositoryRoot = join(import.meta.dirname, '..', '..')

// A workspace whose socle logger records the source each line is tagged with.
function workspace(): { root: string; modules: Module[] } {
  const root = mkdtempSync(join(tmpdir(), 'log-plugin-'))
  const files: Record<string, string> = {
    'packages/platform/src/log.ts':
      'export const logFrom = (source) => (event) => console.log(JSON.stringify({ event, ...source }))',
    'apps/api/src/main.ts': "import { log } from '@polly/platform/log'\nimport './routes.ts'\nlog('main')",
    'apps/api/src/routes.ts': "import { log } from '@polly/platform/log'\nlog('routes')",
    'packages/back/src/domains/codes/index.ts': "import { log } from '@polly/platform/log'\nlog('domain')",
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return {
    root,
    modules: [
      { id: 'apps/api/src', tier: 'interfaces', files: ['apps/api/src/main.ts', 'apps/api/src/routes.ts'] },
      {
        id: 'packages/back/src/domains/codes',
        tier: 'domains',
        files: ['packages/back/src/domains/codes/index.ts'],
      },
    ],
  }
}

async function bundle(root: string, modules: Module[], entry: string): Promise<string> {
  const { outputFiles } = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    write: false,
    format: 'esm',
    logLevel: 'silent',
    plugins: [esbuildLogPlugin(root, () => modules)],
  })
  return outputFiles[0]?.text ?? ''
}

describe('the log plugin', () => {
  it("tags each file's logger with its tier, module and path, in an esbuild build", async () => {
    const { root, modules } = workspace()
    writeFileSync(join(root, 'out.mjs'), await bundle(root, modules, 'apps/api/src/main.ts'))
    const lines = execFileSync(process.execPath, [join(root, 'out.mjs')], { encoding: 'utf8' })
      .trim()
      .split('\n')
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { event: 'routes', tier: 'interfaces', module: 'apps/api/src', file: 'apps/api/src/routes.ts' },
      { event: 'main', tier: 'interfaces', module: 'apps/api/src', file: 'apps/api/src/main.ts' },
    ])
  })

  it('refuses the import from a domain, and from a file of no tier, naming the rule', async () => {
    const { root, modules } = workspace()
    await expect(bundle(root, modules, 'packages/back/src/domains/codes/index.ts')).rejects.toThrow(
      'packages/back/src/domains/codes/index.ts is in the domains tier, which does not log (constitution XIX)',
    )
    await expect(bundle(root, [], 'apps/api/src/main.ts')).rejects.toThrow(
      'apps/api/src/main.ts is in no tier that logs (constitution XIX)',
    )
  })

  it('resolves the same tagged logger for Vitest, per importing file', () => {
    const { root, modules } = workspace()
    const plugin = vitestLogPlugin(root, () => modules)
    const id = plugin.resolveId('@polly/platform/log', join(root, 'apps/api/src/routes.ts'))
    expect(plugin.resolveId('@polly/platform', join(root, 'apps/api/src/routes.ts'))).toBeUndefined()
    expect(plugin.load(String(id))).toContain('"file":"apps/api/src/routes.ts"')
    expect(plugin.load('/elsewhere.ts')).toBeUndefined()
    const domain = plugin.resolveId(
      '@polly/platform/log',
      join(root, 'packages/back/src/domains/codes/index.ts'),
    )
    expect(() => plugin.load(String(domain))).toThrow('does not log')
  })

  it("reads the repository's modules from the analyzer", () => {
    const api = readModules(repositoryRoot).find(({ id }) => id === 'apps/api/src')
    expect(api?.tier).toBe('interfaces')
    expect(api?.files).toContain('apps/api/src/main.ts')
  })
})
