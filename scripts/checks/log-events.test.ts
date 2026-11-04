import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readModules } from './analyzer.ts'
import { checkRepository as check, run } from './log-events.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'log-events-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const declared = (constant: string, name: string, category = 'access') =>
  `export const ${constant} = defineEvent('${name}', { category: '${category}', level: 'info', investigate: 'x' })\n`

// Each fixture file's module and tier, as the analyzer places them.
const MODULES = [
  { id: 'apps/api/src', tier: 'interfaces', files: ['apps/api/src/events.ts', 'apps/api/src/app.ts'] },
  { id: 'apps/mcp/src', tier: 'interfaces', files: ['apps/mcp/src/events.ts', 'apps/mcp/src/main.ts'] },
  {
    id: 'packages/back/src/flows/serve',
    tier: 'flows',
    files: ['packages/back/src/flows/serve/events.ts', 'packages/back/src/flows/serve/index.ts'],
  },
  {
    id: 'packages/back/src/domains/codes',
    tier: 'domains',
    files: ['packages/back/src/domains/codes/events.ts', 'packages/back/src/domains/codes/index.ts'],
  },
  {
    id: 'packages/queue',
    tier: 'adapters',
    files: ['packages/queue/src/events.ts', 'packages/queue/src/index.ts'],
  },
]
const checkRepository = (root: string) => check(root, MODULES)

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
    expect(check(repositoryRoot, readModules(repositoryRoot))).toEqual([])
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

  it('reads a declaration whose name or category sits on another line', () => {
    const root = fixture({
      ...valid,
      'apps/api/src/events.ts': [
        declared('REQUEST_SERVED', 'api.request.served'),
        'export const REQUEST_FAILED = defineEvent(',
        "  'api.request.served',",
        "  { category: 'access', level: 'error', investigate: 'x' },",
        ')',
        'export const QUEUE_LAGGED =',
        "  defineEvent('api.queue.lagged', {",
        "    category: 'technical',",
        "    level: 'warn',",
        '  })',
        '',
      ].join('\n'),
      'apps/api/src/app.ts': 'log(REQUEST_SERVED); log(REQUEST_FAILED); log(QUEUE_LAGGED)\n',
    })
    expect(checkRepository(root)).toEqual([
      'apps/api/src/events.ts:3: api.request.served is already declared in apps/api/src/events.ts: give each event its own name',
      'apps/api/src/events.ts:7: api.queue.lagged is a technical event, which the interfaces tier does not log: log access and security events there, technical events from an adapter',
    ])
  })

  it('refuses an event whose category its tier does not log, and an event of a tier that never logs', () => {
    const root = fixture({
      ...valid,
      'apps/mcp/src/events.ts': `${declared('REQUEST_SERVED', 'mcp.request.served')}${declared('FOUND', 'mcp.lesson.found', 'functional')}`,
      'apps/mcp/src/main.ts': 'log(REQUEST_SERVED); log(FOUND)\n',
      'packages/back/src/flows/serve/events.ts': `${declared('SERVED', 'serve.lesson.served', 'functional')}${declared('DENIED', 'serve.access.denied', 'security')}`,
      'packages/back/src/flows/serve/index.ts': 'log(SERVED); log(DENIED)\n',
      'packages/back/src/domains/codes/events.ts': declared('DRAWN', 'codes.code.drawn', 'functional'),
      'packages/back/src/domains/codes/index.ts': 'log(DRAWN)\n',
      'packages/queue/src/events.ts': `${declared('LAGGED', 'queue.task.lagged', 'technical')}${declared('SEEN', 'queue.task.seen', 'access')}`,
      'packages/queue/src/index.ts': 'log(LAGGED); log(SEEN)\n',
      'packages/kernel/src/events.ts': declared('MADE', 'kernel.id.made', 'technical'),
      'packages/kernel/src/index.ts': 'log(MADE)\n',
    })
    expect(checkRepository(root)).toEqual([
      'apps/mcp/src/events.ts:2: mcp.lesson.found is a functional event, which the interfaces tier does not log: log access and security events there, functional events from a flow',
      'packages/back/src/domains/codes/events.ts:1: codes.code.drawn is a functional event, which the domains tier does not log: return the decision as a value or a refusal, and log it from a flow',
      'packages/back/src/flows/serve/events.ts:2: serve.access.denied is a security event, which the flows tier does not log: log functional events there, security events from a route or workflow',
      'packages/kernel/src/events.ts:1: kernel.id.made is declared in no module the analyzer places in a tier: move it into a tier that logs',
      'packages/queue/src/events.ts:2: queue.task.seen is an access event, which the adapters tier does not log: log technical events there, access events from a route or workflow',
    ])
  })

  it('reports each violation and exits 1, or exits 0', () => {
    const lines: string[] = []
    const read = () => MODULES
    expect(run([fixture({ ...valid, 'apps/mcp/src/main.ts': '' })], (line) => lines.push(line), read)).toBe(1)
    expect(lines).toHaveLength(1)
    expect(run([fixture(valid)], (line) => lines.push(line), read)).toBe(0)
  })
})
