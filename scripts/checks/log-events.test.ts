import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkRepository, run } from './log-events.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'log-events-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const declared = (constant: string, name: string) =>
  `export const ${constant} = defineEvent('${name}', { category: 'access', level: 'info', investigate: 'x' })\n`

const valid = {
  'apps/api/src/events.ts': declared('REQUEST_SERVED', 'api.request.served'),
  'apps/api/src/app.ts': 'log(REQUEST_SERVED, fields)\n',
  // Two processes may name their constants alike: each is used in its own.
  'apps/mcp/src/events.ts': declared('REQUEST_SERVED', 'mcp.request.served'),
  'apps/mcp/src/main.ts': 'log(REQUEST_SERVED, fields)\n',
  'packages/platform/src/log.ts': 'export function defineEvent(name: string, spec: Spec) {}\n',
  'packages/platform/src/log.test.ts': "defineEvent('api.request.served', spec)\n",
  'packages/logging/node_modules/x/index.js': "defineEvent('x.y.z', spec)\n",
}

describe('log events guard', () => {
  it('accepts the repository as it is', () => {
    expect(checkRepository(repositoryRoot)).toEqual([])
  })

  it('accepts each event declared once in an events.ts and emitted in its package, tests aside', () => {
    expect(checkRepository(fixture(valid))).toEqual([])
  })

  it('refuses an event declared outside an events.ts', () => {
    const root = fixture({
      ...valid,
      'apps/api/src/app.ts': `log(REQUEST_SERVED)\n${declared('X', 'api.x.y')}`,
    })
    expect(checkRepository(root)).toEqual([
      "apps/api/src/app.ts:2: api.x.y is declared outside an events.ts: declare it in its module's events.ts",
    ])
  })

  it('refuses a name declared twice', () => {
    const root = fixture({
      ...valid,
      'apps/mcp/src/events.ts': declared('REQUEST_SERVED', 'api.request.served'),
    })
    expect(checkRepository(root)).toEqual([
      'apps/mcp/src/events.ts:1: api.request.served is already declared in apps/api/src/events.ts: give each event its own name',
    ])
  })

  it('refuses an event its package never emits', () => {
    const root = fixture({ ...valid, 'apps/mcp/src/main.ts': 'serve()\n' })
    expect(checkRepository(root)).toEqual([
      'apps/mcp/src/events.ts:1: mcp.request.served is never emitted in apps/mcp/src: emit it, or remove its declaration',
    ])
  })

  it('reports each violation and exits 1, or exits 0', () => {
    const lines: string[] = []
    expect(run([fixture({ ...valid, 'apps/mcp/src/main.ts': '' })], (line) => lines.push(line))).toBe(1)
    expect(lines).toHaveLength(1)
    expect(run([fixture(valid)], (line) => lines.push(line))).toBe(0)
  })
})
