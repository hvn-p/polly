// The matrix: rows import columns, both in tier order, folded by group, tier and
// module from its own headers; a side panel reads the selected pair or module.
// The wheel scrolls, Ctrl or Cmd with the wheel (or a pinch) zooms around the
// pointer, dragging pans, and an overview in the corner moves the view.

import { type CSSProperties, Fragment, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react'
import {
  type AxisGroup,
  axis,
  cellOf,
  type Folds,
  type Item,
  itemsOf,
  labelOf,
  ruleOf,
  tierName,
  tierOfModule,
  zoneOf,
} from './model.ts'
import { ImportLine, ModuleChip, moduleHref, Outward, STATUS, TierTag, useView } from './parts.tsx'

export type Selection = { kind: 'pair'; from: string; to: string } | { kind: 'module'; id: string }

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
// Below this zoom, module names no longer fit their cell and are hidden.
const isTiny = (zoom: number) => zoom * 25 - 9 < 8
// A module name in a header holds at most this many characters, so no name widens the
// row headers' column: in the monospace font, with its station, it fills the 240px the
// styles allow. Generous: Polly's flows all fit whole but the longest two.
const HEADER_CHARS = 31
const headerLabel = (label: string) =>
  label.length > HEADER_CHARS ? `${label.slice(0, HEADER_CHARS - 1)}…` : label

// The overview's colours, one per cell class.
const OVERVIEW: Record<string, string> = {
  ok: '#3d5a37',
  cond: '#6b5d2c',
  no: '#4a2a24',
  same: '#3a3a37',
  breach: '#ff5a36',
  diag: '#121212',
}

interface MatrixProps {
  folds: Folds
  onFolds: (folds: Folds) => void
  selection: Selection | undefined
  onSelect: (selection: Selection) => void
  zoom: number
  onZoom: (zoom: number) => void
}

// An axis entry's identity: its module, or the tier or group it folds.
const keyOf = (item: Item) => item.id ?? `${item.agg}:${item.agg === 'group' ? item.group : item.tier}`

const toggled = (set: Set<string>, key: string) => {
  const next = new Set(set)
  if (!next.delete(key)) {
    next.add(key)
  }
  return next
}

export function Matrix({ folds, onFolds, selection, onSelect, zoom, onZoom }: MatrixProps) {
  const { model } = useView()
  const tree = axis(model, folds)
  const items = itemsOf(tree)
  const scroller = useRef<HTMLDivElement>(null)
  const table = useRef<HTMLTableElement>(null)
  const overview = useRef<HTMLCanvasElement>(null)
  const bands = useRef<{ row: HTMLDivElement | null; column: HTMLDivElement | null }>({
    row: null,
    column: null,
  })
  const hovered = useRef<HTMLElement | null>(null)
  const anchor = useRef<{ x: number; y: number; ratio: number; cx: number; cy: number } | null>(null)
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(
    null,
  )
  const suppressClick = useRef(false)

  const zoomTo = (target: number, cx?: number, cy?: number) => {
    const sc = scroller.current
    const z = clampZoom(target)
    if (sc !== null) {
      const ax = cx ?? sc.clientWidth / 2
      const ay = cy ?? sc.clientHeight / 2
      anchor.current = { x: ax + sc.scrollLeft, y: ay + sc.scrollTop, ratio: z / zoom, cx: ax, cy: ay }
    }
    onZoom(z)
  }
  // Fills the view with the matrix as it is at 100%.
  const fit = () => {
    const sc = scroller.current
    const m = table.current
    const width = (m?.offsetWidth ?? 0) / zoom
    const height = (m?.offsetHeight ?? 0) / zoom
    const fill = Math.min((sc?.clientWidth ?? 0) / width, (sc?.clientHeight ?? 0) / height) * 0.98
    zoomTo(Number.isFinite(fill) && fill > 0 ? fill : MIN_ZOOM)
  }
  const zoomRef = useRef({ zoomTo, fit, zoom })
  zoomRef.current = { zoomTo, fit, zoom }

  // After each render: the sticky headers' offsets, the zoom's anchor, the overview.
  useLayoutEffect(() => {
    const m = table.current
    const sc = scroller.current
    if (m === null || sc === null) {
      return
    }
    let top = 0
    const heads = [...m.querySelectorAll<HTMLTableRowElement>('tr.h')]
    for (const row of heads) {
      for (const th of row.querySelectorAll<HTMLElement>('th')) {
        th.style.setProperty('--t', `${top}px`)
      }
      top += row.offsetHeight
    }
    let left = 0
    for (const column of ['c0', 'c1', 'c2']) {
      const width = heads[2]?.querySelector<HTMLElement>(`.${column}`)?.offsetWidth ?? 0
      for (const th of m.querySelectorAll<HTMLElement>(`.${column}`)) {
        th.style.setProperty('--l', `${left}px`)
      }
      left += width
    }
    if (anchor.current !== null) {
      const { x, y, ratio, cx, cy } = anchor.current
      sc.scrollLeft = x * ratio - cx
      sc.scrollTop = y * ratio - cy
      anchor.current = null
    }
    drawOverview()
  })

  const drawOverview = () => {
    const canvas = overview.current
    const m = table.current
    const sc = scroller.current
    const g = canvas?.getContext('2d')
    if (canvas == null || m === null || sc === null || g == null) {
      return
    }
    const rows = [...m.querySelectorAll('tr:not(.h)')].map((r) => [...r.querySelectorAll('td')])
    const px = Math.max(2, Math.floor(150 / Math.max(1, rows.length)))
    const size = rows.length * px
    canvas.width = canvas.height = size + 8
    rows.forEach((row, i) => {
      row.forEach((td, j) => {
        g.fillStyle = OVERVIEW[td.classList[0] ?? ''] ?? '#222'
        g.fillRect(4 + j * px, 4 + i * px, px, px)
      })
    })
    const fx = size / Math.max(1, m.scrollWidth)
    const fy = size / Math.max(1, m.scrollHeight)
    g.strokeStyle = '#ecebe6'
    g.lineWidth = 1.5
    g.strokeRect(
      4 + sc.scrollLeft * fx,
      4 + sc.scrollTop * fy,
      Math.min(size, sc.clientWidth * fx),
      Math.min(size, sc.clientHeight * fy),
    )
  }

  const moveTo = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = overview.current
    const m = table.current
    const sc = scroller.current
    if (canvas === null || m === null || sc === null) {
      return
    }
    const box = canvas.getBoundingClientRect()
    const size = canvas.width - 8
    sc.scrollLeft = ((event.clientX - box.left - 4) / size) * m.scrollWidth - sc.clientWidth / 2
    sc.scrollTop = ((event.clientY - box.top - 4) / size) * m.scrollHeight - sc.clientHeight / 2
  }

  // Ctrl or Cmd with the wheel zooms; React's wheel listener is passive, so this one is not.
  useEffect(() => {
    const sc = scroller.current
    if (sc === null) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }
      event.preventDefault()
      const box = sc.getBoundingClientRect()
      const speed = Math.abs(event.deltaY) < 20 ? 0.01 : 0.0025
      const { zoomTo: to, zoom: z } = zoomRef.current
      to(z * Math.exp(-event.deltaY * speed), event.clientX - box.left, event.clientY - box.top)
    }
    sc.addEventListener('wheel', onWheel, { passive: false })
    return () => sc.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input,textarea')) {
        return
      }
      const { zoomTo: to, fit: fill, zoom: z } = zoomRef.current
      if (event.key === '+' || event.key === '=') {
        to(z * 1.2)
      } else if (event.key === '-') {
        to(z / 1.2)
      } else if (event.key === '0') {
        fill()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // The crosshair: two bands follow the hovered cell, and its two headers light up.
  const hover = (event: React.PointerEvent) => {
    const td = event.target instanceof Element ? event.target.closest<HTMLElement>('td[data-i]') : null
    if (td === hovered.current) {
      return
    }
    const m = table.current
    const header = (cell: HTMLElement | null, kind: 'row' | 'column') =>
      cell === null || m === null
        ? undefined
        : m.querySelectorAll(kind === 'row' ? 'th.th-mod' : 'th.ch-mod')[
            Number(cell.dataset[kind === 'row' ? 'i' : 'j'])
          ]
    header(hovered.current, 'row')?.classList.remove('hl')
    header(hovered.current, 'column')?.classList.remove('hl')
    hovered.current = td
    const { row, column } = bands.current
    if (row === null || column === null) {
      return
    }
    if (td === null || m === null) {
      row.style.opacity = '0'
      column.style.opacity = '0'
      return
    }
    Object.assign(row.style, {
      width: `${m.offsetWidth}px`,
      height: `${td.offsetHeight}px`,
      transform: `translateY(${td.offsetTop}px)`,
      opacity: '1',
    })
    Object.assign(column.style, {
      height: `${m.offsetHeight}px`,
      width: `${td.offsetWidth}px`,
      transform: `translateX(${td.offsetLeft}px)`,
      opacity: '1',
    })
    header(td, 'row')?.classList.add('hl')
    header(td, 'column')?.classList.add('hl')
  }

  const startPan = (event: React.PointerEvent) => {
    const sc = scroller.current
    if (sc === null || event.button !== 0) {
      return
    }
    pan.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: sc.scrollLeft,
      top: sc.scrollTop,
      moved: false,
    }
  }
  const movePan = (event: React.PointerEvent) => {
    const sc = scroller.current
    const p = pan.current
    if (sc === null || p === null || event.pointerId !== p.id) {
      return
    }
    const dx = event.clientX - p.x
    const dy = event.clientY - p.y
    if (!p.moved) {
      if (Math.hypot(dx, dy) < 5) {
        return
      }
      p.moved = true
      sc.setPointerCapture?.(p.id)
      sc.classList.add('panning')
    }
    sc.scrollLeft = p.left - dx
    sc.scrollTop = p.top - dy
  }
  const endPan = () => {
    if (pan.current?.moved) {
      suppressClick.current = true
      scroller.current?.classList.remove('panning')
      setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }
    pan.current = null
  }
  const swallowClickAfterPan = (event: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false
      event.stopPropagation()
      event.preventDefault()
    }
  }

  const foldGroup = (group: string) => onFolds({ ...folds, groups: toggled(folds.groups, group) })
  const foldTier = (tier: string) => onFolds({ ...folds, tiers: toggled(folds.tiers, tier) })
  const all = (open: boolean) =>
    onFolds({
      groups: open ? new Set() : new Set(model.groups),
      tiers: open ? new Set() : new Set(model.tiers.map((t) => t.id)),
    })
  const choose = (row: Item, column: Item) => {
    if (row.agg !== undefined || column.agg !== undefined) {
      const groups = new Set(folds.groups)
      const tiers = new Set(folds.tiers)
      for (const item of [row, column]) {
        if (item.agg === 'group') {
          groups.delete(item.group)
        } else if (item.agg === 'tier') {
          tiers.delete(item.tier)
        }
      }
      onFolds({ groups, tiers })
      return
    }
    onSelect({ kind: 'pair', from: row.ids[0] ?? '', to: column.ids[0] ?? '' })
  }

  const isSelectedModule = (id: string | undefined) => selection?.kind === 'module' && selection.id === id

  return (
    <div className="mx">
      <section className="grid" onPointerOver={hover}>
        <div className="toolbar">
          <span className="hint">
            Rows import columns. Click a group or a tier to fold it, a module to read it. Wheel to scroll,
            Ctrl or Cmd with the wheel to zoom, drag to move.
          </span>
          <Key colour="#22301f">allowed</Key>
          <Key colour="#3b3319">on a condition</Key>
          <Key colour="#2c1b18">forbidden</Key>
          <Key colour="#262624">same tier</Key>
          <Key colour="var(--breach)">breach</Key>
          <span className="bulk">
            <fieldset className="zoom" aria-label="Zoom">
              <button type="button" title="Zoom out (−)" onClick={() => zoomTo(zoom / 1.2)}>
                −
              </button>
              <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
              <button type="button" title="Zoom in (+)" onClick={() => zoomTo(zoom * 1.2)}>
                +
              </button>
              <button type="button" title="Fill the view, from 100% (0)" onClick={fit}>
                Fit
              </button>
            </fieldset>
            <button type="button" className="chip" onClick={() => all(true)}>
              Expand all
            </button>
            <button type="button" className="chip" onClick={() => all(false)}>
              Collapse all
            </button>
          </span>
        </div>
        <div
          className="scroller"
          ref={scroller}
          onScroll={() => requestAnimationFrame(drawOverview)}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onClickCapture={swallowClickAfterPan}
        >
          <div className="wrap">
            <div
              className="band"
              ref={(el) => {
                bands.current.row = el
              }}
            />
            <div
              className="band"
              ref={(el) => {
                bands.current.column = el
              }}
            />
            <table
              className={`m${isTiny(zoom) ? ' tiny' : ''}`}
              ref={table}
              style={{ '--z': zoom } as CSSProperties}
              aria-label="Dependency matrix"
            >
              <Heads
                tree={tree}
                items={items}
                folds={folds}
                foldGroup={foldGroup}
                foldTier={foldTier}
                onSelect={onSelect}
                overview={
                  <canvas
                    className="mini"
                    ref={overview}
                    title="Overview: click or drag to move"
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      event.currentTarget.setPointerCapture?.(event.pointerId)
                      moveTo(event)
                    }}
                    onPointerMove={(event) => {
                      if (event.buttons === 1) {
                        moveTo(event)
                      }
                    }}
                  />
                }
              />
              <tbody>
                <Rows
                  tree={tree}
                  items={items}
                  folds={folds}
                  selection={selection}
                  foldGroup={foldGroup}
                  foldTier={foldTier}
                  choose={choose}
                  onSelect={onSelect}
                  isSelectedModule={isSelectedModule}
                />
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <aside className="side" aria-label="Detail">
        {selection?.kind === 'module' ? (
          <ModulePanel id={selection.id} onSelect={onSelect} />
        ) : (
          <PairPanel selection={selection} onSelect={onSelect} />
        )}
      </aside>
    </div>
  )
}

function Key({ colour, children }: { colour: string; children: string }) {
  return (
    <span className="k">
      <i style={{ background: colour }} />
      {children}
    </span>
  )
}

interface HeadsProps {
  tree: AxisGroup[]
  items: Item[]
  folds: Folds
  foldGroup: (group: string) => void
  foldTier: (tier: string) => void
  onSelect: (selection: Selection) => void
  // Drawn in the corner the headers leave, so it never covers a cell.
  overview: ReactNode
}

const corner = (
  <>
    <th className="sl c0" />
    <th className="sl c1" />
    <th className="sl c2" />
  </>
)

function Heads({ tree, items, folds, foldGroup, foldTier, onSelect, overview }: HeadsProps) {
  const { model } = useView()
  return (
    <thead>
      <tr className="h">
        {corner}
        {tree.map((g) => (
          <th
            key={g.group}
            className="g-col hd"
            colSpan={g.tiers.reduce((n, t) => n + t.items.length, 0)}
            title={`${g.folded ? 'Expand' : 'Collapse'} the ${g.group} group`}
            onClick={() => foldGroup(g.group)}
          >
            {g.folded ? null : (
              <>
                <span className="mute">group</span> {g.group}
              </>
            )}
          </th>
        ))}
      </tr>
      <tr className="h">
        {corner}
        {tree.map((g) =>
          g.folded ? (
            <th key={g.group} />
          ) : (
            g.tiers.map((t) => {
              const tier = t.tier ?? ''
              return (
                <th
                  key={tier}
                  className="ch-tier hd"
                  colSpan={t.items.length}
                  style={{ borderBottomColor: model.colour[tier] }}
                  title={`${folds.tiers.has(tier) ? 'Expand' : 'Collapse'} ${tierName(model, tier)}`}
                  onClick={() => foldTier(tier)}
                >
                  {t.items.length > 2 ? tierName(model, tier) : null}
                </th>
              )
            })
          ),
        )}
      </tr>
      <tr className="h">
        <th className="sl c0" />
        <th className="sl c1" />
        <th className="sl c2">{overview}</th>
        {items.map((c, j) =>
          c.agg !== undefined ? (
            <th
              key={keyOf(c)}
              className="ch-mod hd"
              data-j={j}
              onClick={() => (c.agg === 'group' ? foldGroup(c.group) : foldTier(c.tier))}
            >
              <span className="agg-label">{c.label}</span>
            </th>
          ) : (
            <th key={c.id} className="ch-mod" data-j={j}>
              <button
                type="button"
                title={labelOf(model, c.id ?? '')}
                onClick={() => onSelect({ kind: 'module', id: c.id ?? '' })}
              >
                <span>{headerLabel(labelOf(model, c.id ?? ''))}</span>
              </button>
            </th>
          ),
        )}
      </tr>
    </thead>
  )
}

interface RowsProps {
  tree: AxisGroup[]
  items: Item[]
  folds: Folds
  selection: Selection | undefined
  foldGroup: (group: string) => void
  foldTier: (tier: string) => void
  choose: (row: Item, column: Item) => void
  onSelect: (selection: Selection) => void
  isSelectedModule: (id: string | undefined) => boolean
}

function Rows({
  tree,
  items,
  folds,
  selection,
  foldGroup,
  foldTier,
  choose,
  onSelect,
  isSelectedModule,
}: RowsProps) {
  const { model } = useView()
  let index = 0
  return tree.map((g) => {
    const groupRows = g.tiers.reduce((n, t) => n + t.items.length, 0)
    return (
      <Fragment key={g.group}>
        {g.tiers.map((t, tierIndex) =>
          t.items.map((row, k) => {
            const i = index++
            const tier = t.tier ?? ''
            const first = tierIndex === 0 && k === 0
            return (
              <tr key={keyOf(row)}>
                {first ? (
                  <th
                    className="g-row hd sl c0"
                    rowSpan={groupRows}
                    style={{ '--rows': groupRows } as CSSProperties}
                    title={`${g.folded ? 'Expand' : 'Collapse'} ${g.group}`}
                    onClick={() => foldGroup(g.group)}
                  >
                    <div>{g.folded ? null : g.group}</div>
                  </th>
                ) : null}
                {g.folded ? (
                  first ? (
                    <th className="sl c1" rowSpan={groupRows} />
                  ) : null
                ) : k === 0 ? (
                  <th
                    className="th-tier hd sl c1"
                    rowSpan={t.items.length}
                    style={
                      { borderRightColor: model.colour[tier], '--rows': t.items.length } as CSSProperties
                    }
                    title={`${folds.tiers.has(tier) ? 'Expand' : 'Collapse'} ${tierName(model, tier)}`}
                    onClick={() => foldTier(tier)}
                  >
                    <div>{t.items.length > 2 ? tierName(model, tier) : null}</div>
                  </th>
                ) : null}
                {row.agg !== undefined ? (
                  <th
                    className="th-mod agg hd sl c2"
                    data-i={i}
                    onClick={() => (row.agg === 'group' ? foldGroup(row.group) : foldTier(row.tier))}
                  >
                    <button type="button">
                      <span
                        className="stn"
                        style={{ color: row.agg === 'group' ? '#8c8a84' : model.colour[row.tier] }}
                      />
                      {row.label}
                    </button>
                  </th>
                ) : (
                  <th className={`sl c2 th-mod${isSelectedModule(row.id) ? ' on' : ''}`} data-i={i}>
                    <button
                      type="button"
                      title={labelOf(model, row.id ?? '')}
                      onClick={() => onSelect({ kind: 'module', id: row.id ?? '' })}
                    >
                      <span className="stn" style={{ color: model.colour[row.tier] }} />
                      {headerLabel(labelOf(model, row.id ?? ''))}
                    </button>
                  </th>
                )}
                {items.map((column, j) => {
                  if (i === j) {
                    return <td key={keyOf(column)} className="diag" />
                  }
                  const cell = cellOf(model, row, column)
                  const selected =
                    selection?.kind === 'pair' &&
                    row.ids.includes(selection.from) &&
                    column.ids.includes(selection.to)
                  const classes = [
                    cell.breach ? 'breach' : zoneOf(model, row, column),
                    row.agg || column.agg ? 'agg' : '',
                    cell.added ? 'add' : '',
                    selected ? 'sel' : '',
                  ]
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: a cell is chosen with the pointer; the keyboard reaches each pair through the module buttons of the headers and their panel.
                    <td
                      key={keyOf(column)}
                      className={classes.filter(Boolean).join(' ')}
                      data-i={i}
                      data-j={j}
                      onClick={() => choose(row, column)}
                    >
                      {cell.n || ''}
                    </td>
                  )
                })}
              </tr>
            )
          }),
        )}
      </Fragment>
    )
  })
}

function PairPanel({
  selection,
  onSelect,
}: {
  selection: Selection | undefined
  onSelect: (s: Selection) => void
}) {
  const { model } = useView()
  if (selection?.kind !== 'pair') {
    return <p className="empty">Select a cell to read the rule for its pair and the imports behind it.</p>
  }
  const rule = ruleOf(model, tierOfModule(model, selection.from), tierOfModule(model, selection.to))
  const edges = model.report.edges.filter((e) => e.from === selection.from && e.to === selection.to)
  // Each rule the pair breaks once, with its fix.
  const breaches = [
    ...new Map(edges.flatMap(model.breachesOf).map((v) => [`${v.rule}:${v.fix}`, v])).values(),
  ]
  const kind = breaches.length === 0 ? rule.kind : 'breach'
  const select = (id: string) => onSelect({ kind: 'module', id })
  return (
    <>
      <span className={`status lead ${kind === 'same' ? 'ok' : kind}`}>{STATUS[kind]}</span>
      {breaches.length === 0 ? (
        <p className="reason">{rule.why}</p>
      ) : (
        breaches.map((v) => (
          <p className="reason" key={`${v.rule}:${v.fix}`}>
            <b>{v.rule}:</b> {v.fix}
          </p>
        ))
      )}
      <div className="rel">
        <ModuleChip id={selection.from} onSelect={select} />
        <div className={`arrow${breaches.length === 0 ? '' : ' breach'}`}>
          <svg viewBox="0 0 14 30" aria-hidden="true">
            <path d="M7 1v26M2 21l5 6 5-6" />
          </svg>
          imports
        </div>
        <ModuleChip id={selection.to} onSelect={select} />
      </div>
      <h3>
        {edges.length} import{edges.length === 1 ? '' : 's'}
      </h3>
      <div className="imports">
        {edges.length === 0 ? (
          <p className="empty">No import between these modules.</p>
        ) : (
          edges.map((e) => <ImportLine key={`${e.file}:${e.line}`} edge={e} />)
        )}
      </div>
    </>
  )
}

function ModulePanel({ id, onSelect }: { id: string; onSelect: (s: Selection) => void }) {
  const { model } = useView()
  const list = (direction: 'to' | 'from') => {
    const edges = model.report.edges.filter((e) => (direction === 'to' ? e.from === id : e.to === id))
    const byOther = Map.groupBy(edges, (e) => (direction === 'to' ? e.to : e.from))
    const others = [...byOther.keys()].sort(
      (a, b) =>
        (model.order.get(tierOfModule(model, a)) ?? 0) - (model.order.get(tierOfModule(model, b)) ?? 0),
    )
    if (others.length === 0) {
      return <p className="empty">None.</p>
    }
    return others.map((other) => {
      const [from, to] = direction === 'to' ? [id, other] : [other, id]
      const lines = byOther.get(other) ?? []
      const breach = lines.some((e) => model.breachesOf(e).length > 0)
      const status = breach
        ? 'breach'
        : ruleOf(model, tierOfModule(model, from), tierOfModule(model, to)).kind
      return (
        <button type="button" key={other} onClick={() => onSelect({ kind: 'pair', from, to })}>
          <TierTag id={other} />
          <span className="nm2">{labelOf(model, other)}</span>
          {status === 'ok' || status === 'same' ? (
            <span />
          ) : (
            <span className={`st ${status}`}>{STATUS[status]}</span>
          )}
          <span className="mute">{lines.length}</span>
        </button>
      )
    })
  }
  return (
    <>
      <ModuleChip id={id} onSelect={(m) => onSelect({ kind: 'module', id: m })} />
      <h3>Imports</h3>
      <div className="lst">{list('to')}</div>
      <h3>Imported by</h3>
      <div className="lst">{list('from')}</div>
      <a className="open-page" href={moduleHref(id)}>
        Open module page <Outward />
      </a>
    </>
  )
}
