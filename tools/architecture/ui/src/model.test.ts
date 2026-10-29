import { describe, expect, it } from 'vitest'
import { axis, buildModel, cellOf, changeLines, labelOf, ruleOf, zoneOf } from './model.ts'
import { fixture } from './test/fixture.ts'

const model = buildModel(fixture())

describe('the model of a report', () => {
  it('orders modules by tier, then by name', () => {
    expect(model.modules.map((m) => m.id)).toEqual([
      'apps/api/src',
      'packages/back/src/flows/buy',
      'packages/back/src/flows/sell',
      'packages/database',
      'packages/kernel',
      'apps/web/src',
    ])
  })

  it('gives each tier of a group its own colour', () => {
    const server = ['routes', 'flows', 'adapters', 'kernel'].map((t) => model.colour[t])
    expect(new Set(server).size).toBe(4)
    expect(model.colour['web']).toBe(model.colour['routes'])
  })

  it('names a module by its package and its path inside it, knowing nothing of the repository', () => {
    expect(labelOf(model, 'packages/back/src/flows/buy')).toBe('back/flows/buy')
    expect(labelOf(model, 'packages/database')).toBe('database')
    expect(labelOf(model, 'apps/api/src')).toBe('api')
    expect(labelOf(model, 'unknown/module')).toBe('unknown/module')
  })

  it('ties the breaches to the import on their line', () => {
    const [toDatabase] = model.report.edges.filter(
      (e) => e.from === 'packages/back/src/flows/buy' && e.line === 3,
    )
    expect(model.breachesOf(toDatabase).map((v) => v.rule)).toEqual(['tier', 'undeclared'])
    expect(model.breachesOf(model.report.edges[0])).toEqual([])
    expect(model.breachesOf(undefined)).toEqual([])
  })
})

describe('the rule for a pair of tiers', () => {
  it('allows, allows on a condition, forbids, or keeps within the tier', () => {
    expect(ruleOf(model, 'routes', 'flows')).toEqual({ kind: 'ok', why: 'Routes may import Flows.' })
    expect(ruleOf(model, 'routes', 'adapters')).toEqual({
      kind: 'cond',
      why: 'Routes may import Adapters, only from apps/*/src/main.ts.',
    })
    expect(ruleOf(model, 'flows', 'kernel')).toEqual({
      kind: 'cond',
      why: 'Flows may import Kernel, types only. A flow imports only types from the kernel.',
    })
    expect(ruleOf(model, 'flows', 'adapters')).toEqual({ kind: 'no', why: 'A flow chains domains.' })
    expect(ruleOf(model, 'flows', 'flows')).toEqual({
      kind: 'same',
      why: 'Two flows never import each other.',
    })
    expect(ruleOf(model, 'kernel', 'kernel')).toEqual({ kind: 'same', why: 'Inside one tier.' })
  })
})

describe('the matrix axis', () => {
  it('unfolds the first group only, at first', () => {
    const tree = axis(model, { groups: model.foldedGroups, tiers: new Set() })
    expect(tree.map((g) => [g.group, g.folded])).toEqual([
      ['server', false],
      ['web', true],
    ])
    expect(tree[1]?.tiers[0]?.items[0]).toMatchObject({
      agg: 'group',
      ids: ['apps/web/src'],
      label: 'web group · 1 module',
    })
  })

  it('folds a tier into one entry holding its modules', () => {
    const tree = axis(model, { groups: new Set(), tiers: new Set(['flows']) })
    const flows = tree[0]?.tiers.find((t) => t.tier === 'flows')
    expect(flows?.items).toEqual([
      {
        agg: 'tier',
        group: 'server',
        tier: 'flows',
        ids: ['packages/back/src/flows/buy', 'packages/back/src/flows/sell'],
        label: 'Flows · 2',
      },
    ])
  })

  it('sums a cell over the modules it holds, marking a breach and an addition against the base', () => {
    const tree = axis(model, { groups: new Set(), tiers: new Set(['flows']) })
    const items = tree.flatMap((g) => g.tiers.flatMap((t) => t.items))
    const flows = items.find((i) => i.tier === 'flows')
    const database = items.find((i) => i.ids.includes('packages/database'))
    if (flows === undefined || database === undefined) {
      throw new Error('missing axis items')
    }
    expect(cellOf(model, flows, database)).toEqual({ n: 1, breach: true, added: true })
    expect(cellOf(model, database, flows)).toEqual({ n: 0, breach: false, added: false })
  })

  it('colours a cell by the rule of its tiers, a group by its most open rule', () => {
    const tree = axis(model, { groups: new Set(['web']), tiers: new Set() })
    const items = tree.flatMap((g) => g.tiers.flatMap((t) => t.items))
    const at = (id: string) => {
      const item = items.find((i) => i.ids.includes(id))
      if (item === undefined) {
        throw new Error(id)
      }
      return item
    }
    expect(zoneOf(model, at('apps/api/src'), at('packages/database'))).toBe('cond')
    expect(zoneOf(model, at('packages/kernel'), at('apps/api/src'))).toBe('no')
    expect(zoneOf(model, at('apps/web/src'), at('apps/api/src'))).toBe('no')
    expect(zoneOf(model, at('apps/api/src'), at('apps/web/src'))).toBe('no')
    expect(zoneOf(model, at('apps/web/src'), at('apps/web/src'))).toBe('same')
    const both = axis(model, { groups: new Set(['server', 'web']), tiers: new Set() }).flatMap((g) =>
      g.tiers.flatMap((t) => t.items),
    )
    const [server, web] = both
    if (server === undefined || web === undefined) {
      throw new Error('missing groups')
    }
    expect(zoneOf(model, server, server)).toBe('same')
    expect(zoneOf(model, web, server)).toBe('no')
  })
})

describe('a change of the session, in lines', () => {
  it('lists the pairs added and removed, then the breaches and the fixes', () => {
    expect(
      changeLines(model, {
        at: 0,
        files: ['packages/back/src/flows/buy/index.ts'],
        added: [['packages/back/src/flows/buy', 'packages/database']],
        removed: [['apps/api/src', 'packages/kernel']],
        breaches: [{ rule: 'tier', file: 'f', line: 1, message: 'Flows may not import Adapters.', fix: 'x' }],
        fixed: [{ rule: 'isolated', file: 'f', line: 2, message: 'Two flows.', fix: 'y' }],
      }),
    ).toEqual([
      { kind: 'added', text: 'back/flows/buy → database' },
      { kind: 'removed', text: 'api → kernel' },
      { kind: 'breach', text: 'tier, Flows may not import Adapters.' },
      { kind: 'fixed', text: 'isolated, Two flows.' },
    ])
  })
})
