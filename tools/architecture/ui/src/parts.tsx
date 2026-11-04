// The pieces several views share: icons, a module's chip with its tier, an
// import line that opens its source, and the context they read.

import { Component, type CSSProperties, createContext, type ReactNode, useContext } from 'react'
import { labelOf, type Model, tierName, tierOfModule, type Zone } from './model.ts'
import type { Edge } from './types.ts'

export interface View {
  model: Model
  openSource: (file: string, line: number) => void
}

export const ViewContext = createContext<View | undefined>(undefined)

export function useView(): View {
  const view = useContext(ViewContext)
  if (view === undefined) {
    throw new Error('useView outside the view')
  }
  return view
}

export const STATUS: Record<Zone, string> = {
  breach: 'Breach',
  ok: 'Allowed',
  same: 'Allowed, same tier',
  cond: 'Allowed on a condition',
  no: 'Forbidden',
}

export const moduleHref = (id: string) => `#/module/${encodeURIComponent(id)}`
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function Chevron() {
  return (
    <svg className="i chev" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function Cross() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

export function Outward() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}

export function BackArrow() {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

// A tier's colour as a CSS variable.
export const tint = (colour: string | undefined) => ({ '--c': colour }) as CSSProperties

// A module, its tier attached.
export function ModuleChip({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const { model } = useView()
  const tier = tierOfModule(model, id)
  return (
    <button type="button" className="node" style={tint(model.colour[tier])} onClick={() => onSelect(id)}>
      <span className="tt">{tierName(model, tier)}</span>
      <span className="nm">{labelOf(model, id)}</span>
    </button>
  )
}

// A module's tier as a small tag, for lists.
export function TierTag({ id }: { id: string }) {
  const { model } = useView()
  const tier = tierOfModule(model, id)
  return (
    <span className="tt2" style={tint(model.colour[tier])}>
      {tierName(model, tier)}
    </span>
  )
}

export function ImportLine({ edge }: { edge: Edge }) {
  const { openSource } = useView()
  const names = edge.names.join(', ') || '*'
  return (
    <button type="button" className="imp" onClick={() => openSource(edge.file, edge.line)}>
      <span className="file mono">
        {edge.file}:{edge.line}
      </span>
      <span className="names mono">
        {edge.typeOnly ? 'type ' : ''}
        {`{ ${names} } from '${edge.spec}'`}
      </span>
    </button>
  )
}

// Says why a part of the view shows less than it should, in place of it or at
// its head: the warning colour's mark, what is missing, what to do.
export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="notice" role="status">
      <span className="notice-mark" aria-hidden="true" />
      <p>
        <strong>{title}</strong>
        <span>{children}</span>
      </p>
    </div>
  )
}

// A part of the view that fails to draw from the report (one in a format the
// view does not read) shows its fallback, a notice by default, and the rest of
// the view, the warning above all, stays up. It tries again with the next
// report or file.
export class Contained extends Component<
  { children: ReactNode; attempt: unknown; fallback?: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidUpdate(previous: { attempt: unknown }): void {
    if (this.state.failed && previous.attempt !== this.props.attempt) {
      this.setState({ failed: false })
    }
  }

  override render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }
    return (
      this.props.fallback ?? (
        <Notice title="This view could not be drawn from the analyzer's report">
          The report is not in this view's format; the warning above says how to fix it.
        </Notice>
      )
    )
  }
}
