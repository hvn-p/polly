// What the view computes from a report: tier colours and order, module labels,
// the rule for each pair of tiers, the matrix's axis with its folds, and each
// cell's count. Pure: no DOM, no fetch.

import type { Change, Edge, Module, Report, Tier, Violation } from './types.ts'

// One muted earth colour per tier of a group, in tier order.
const PALETTE = [
  '#d96c5b',
  '#c9a227',
  '#9bb35a',
  '#5fb3a1',
  '#6f8fc9',
  '#a27cc0',
  '#8c8a84',
  '#c8a07a',
  '#c97b9a',
  '#7d9c6b',
]

export type Kind = 'ok' | 'cond' | 'no' | 'same'
export type Zone = Kind | 'breach'

export interface Model {
  report: Report
  tiers: Tier[]
  tierById: Map<string, Tier>
  groups: string[]
  colour: Record<string, string>
  order: Map<string, number>
  // Top tier first, then by id.
  modules: Module[]
  moduleById: Map<string, Module>
  labels: Map<string, string>
  // Module pairs with their import count and whether one breaks a rule.
  pairs: Map<string, { n: number; breach: boolean }>
  // Module pairs the branch adds against its base.
  added: Set<string>
  // Every group but the first, folded when the view opens.
  foldedGroups: Set<string>
  // The rules an import breaks, from the violations on its line.
  breachesOf: (edge: Edge | undefined) => Violation[]
}

export const pairKey = (from: string, to: string) => `${from}>${to}`

const segments = (path: string) => path.split('/').filter((s) => s !== '')

function commonPrefix(ids: string[]): string[] {
  const [first = [], ...rest] = ids.map(segments)
  let n = first.length
  for (const other of rest) {
    let i = 0
    while (i < n && first[i] === other[i]) {
      i++
    }
    n = i
  }
  return first.slice(0, n)
}

// A module's name in the view: its package's name without the scope, then its
// path inside the package, without a leading src. The package's directory is
// the one named like the package, else what its modules share.
function labels(modules: Module[]): Map<string, string> {
  const byPackage = Map.groupBy(modules, (m) => m.package)
  const out = new Map<string, string>()
  for (const [name, members] of byPackage) {
    const bare = name.replace(/^@[^/]+\//, '')
    const shared = commonPrefix(members.map((m) => m.id)).length
    for (const m of members) {
      const parts = segments(m.id)
      const named = parts.lastIndexOf(bare)
      let rest = parts.slice(named >= 0 ? named + 1 : shared)
      while (rest[0] === 'src') {
        rest = rest.slice(1)
      }
      out.set(m.id, [bare, ...rest].join('/'))
    }
  }
  return out
}

export function buildModel(report: Report): Model {
  const tiers = report.tiers
  const tierById = new Map(tiers.map((t) => [t.id, t]))
  const groups = [...new Set(tiers.map((t) => t.group))]
  const colour: Record<string, string> = {}
  for (const group of groups) {
    tiers
      .filter((t) => t.group === group)
      .forEach((t, i) => {
        colour[t.id] = PALETTE[i % PALETTE.length] ?? '#8c8a84'
      })
  }
  const order = new Map(tiers.map((t, i) => [t.id, i]))
  const modules = [...report.modules].sort(
    (a, b) => (order.get(a.tier) ?? 0) - (order.get(b.tier) ?? 0) || a.id.localeCompare(b.id),
  )
  const atLine = Map.groupBy(report.violations, (v) => `${v.file}:${v.line}`)
  const breachesOf = (edge: Edge | undefined) =>
    edge === undefined ? [] : (atLine.get(`${edge.file}:${edge.line}`) ?? [])
  const pairs = new Map<string, { n: number; breach: boolean }>()
  for (const edge of report.edges) {
    const key = pairKey(edge.from, edge.to)
    const pair = pairs.get(key) ?? { n: 0, breach: false }
    pair.n++
    pair.breach ||= breachesOf(edge).length > 0
    pairs.set(key, pair)
  }
  return {
    report,
    tiers,
    tierById,
    groups,
    colour,
    order,
    modules,
    moduleById: new Map(modules.map((m) => [m.id, m])),
    labels: labels(modules),
    pairs,
    added: new Set((report.base?.added ?? []).map(([from, to]) => pairKey(from, to))),
    foldedGroups: new Set(groups.slice(1)),
    breachesOf,
  }
}

export const labelOf = (model: Model, id: string) => model.labels.get(id) ?? id
export const tierName = (model: Model, id: string) => model.tierById.get(id)?.name ?? id
export const tierOfModule = (model: Model, id: string) => model.moduleById.get(id)?.tier ?? ''

// The rule for a module of tier `a` importing one of tier `b`, and why.
export function ruleOf(model: Model, a: string, b: string): { kind: Kind; why: string } {
  const from = model.tierById.get(a)
  if (a === b) {
    return { kind: 'same', why: from?.isolated ?? 'Inside one tier.' }
  }
  const [fromName, toName] = [tierName(model, a), tierName(model, b)]
  const entry = from?.mayImport.find((x) => (typeof x === 'string' ? x : x.tier) === b)
  if (entry === undefined) {
    return { kind: 'no', why: from?.fix ?? `${fromName} may not import ${toName}.` }
  }
  if (typeof entry === 'string') {
    return { kind: 'ok', why: `${fromName} may import ${toName}.` }
  }
  const conditions = [
    entry.typesOnly && 'types only',
    entry.onlyFrom.length > 0 && `only from ${entry.onlyFrom.join(', ')}`,
  ]
  const typesFix = entry.typesOnly && from?.typesFix ? ` ${from.typesFix}` : ''
  return {
    kind: 'cond',
    why: `${fromName} may import ${toName}, ${conditions.filter(Boolean).join(', ')}.${typesFix}`,
  }
}

// One entry of the matrix's axis: a module, or a folded tier or group.
export interface Item {
  agg?: 'group' | 'tier'
  group: string
  tier: string
  ids: string[]
  label?: string
  id?: string
}

export interface AxisGroup {
  group: string
  folded: boolean
  tiers: { tier: string | null; items: Item[] }[]
}

export interface Folds {
  groups: Set<string>
  tiers: Set<string>
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Groups, then tiers, then modules; a folded group or tier is one entry.
export function axis(model: Model, folds: Folds): AxisGroup[] {
  return model.groups
    .map((group): AxisGroup => {
      const tiers = model.tiers
        .filter((t) => t.group === group)
        .map((t) => ({ tier: t.id, modules: model.modules.filter((m) => m.tier === t.id) }))
        .filter((t) => t.modules.length > 0)
      if (folds.groups.has(group)) {
        const ids = tiers.flatMap((t) => t.modules.map((m) => m.id))
        const tier = tiers[0]?.tier ?? ''
        const label = `${group} group · ${plural(ids.length, 'module')}`
        const items: Item[] = [{ agg: 'group', group, tier, ids, label }]
        return { group, folded: true, tiers: ids.length === 0 ? [] : [{ tier: null, items }] }
      }
      return {
        group,
        folded: false,
        tiers: tiers.map((t) => ({
          tier: t.tier,
          items: folds.tiers.has(t.tier)
            ? [
                {
                  agg: 'tier',
                  group,
                  tier: t.tier,
                  ids: t.modules.map((m) => m.id),
                  label: `${tierName(model, t.tier)} · ${t.modules.length}`,
                },
              ]
            : t.modules.map((m) => ({ group, tier: t.tier, ids: [m.id], id: m.id })),
        })),
      }
    })
    .filter((g) => g.tiers.length > 0)
}

export const itemsOf = (tree: AxisGroup[]) => tree.flatMap((g) => g.tiers.flatMap((t) => t.items))

// The imports from the row's modules to the column's.
export function cellOf(
  model: Model,
  row: Item,
  column: Item,
): { n: number; breach: boolean; added: boolean } {
  let n = 0
  let breach = false
  let added = false
  for (const from of row.ids) {
    for (const to of column.ids) {
      const pair = model.pairs.get(pairKey(from, to))
      if (pair !== undefined) {
        n += pair.n
        breach ||= pair.breach
      }
      added ||= model.added.has(pairKey(from, to))
    }
  }
  return { n, breach, added }
}

// The rule colouring a cell; between groups, the most open rule of their tiers.
export function zoneOf(model: Model, row: Item, column: Item): Kind {
  if (row.agg === 'group' || column.agg === 'group') {
    if (row.group === column.group) {
      return 'same'
    }
    const tiersOf = (group: string) => model.tiers.filter((t) => t.group === group).map((t) => t.id)
    const kinds = tiersOf(row.group).flatMap((a) =>
      tiersOf(column.group).map((b) => ruleOf(model, a, b).kind),
    )
    return kinds.includes('ok') ? 'ok' : kinds.includes('cond') ? 'cond' : 'no'
  }
  return ruleOf(model, row.tier, column.tier).kind
}

export interface ChangeLine {
  kind: 'added' | 'removed' | 'breach' | 'fixed'
  text: string
}

export function changeLines(model: Model, change: Change): ChangeLine[] {
  const pair = ([from, to]: [string, string]) => `${labelOf(model, from)} → ${labelOf(model, to)}`
  const rule = (v: Violation) => `${v.rule}, ${v.message}`
  return [
    ...change.added.map((p) => ({ kind: 'added' as const, text: pair(p) })),
    ...change.removed.map((p) => ({ kind: 'removed' as const, text: pair(p) })),
    ...change.breaches.map((v) => ({ kind: 'breach' as const, text: rule(v) })),
    ...change.fixed.map((v) => ({ kind: 'fixed' as const, text: rule(v) })),
  ]
}
