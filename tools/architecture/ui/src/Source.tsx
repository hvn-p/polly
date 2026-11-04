// A file opened in the app at a line: each import's lines tinted with the tier it
// imports and linked to its module after its last line, a breaching import or line
// annotated with its rule and fix, each use of an imported name marked in its
// import's colour. A legend shows or hides the imports of each module and the uses
// of its names, so one can be read alone; a breach always shows.

import { type CSSProperties, Fragment, type ReactNode, useState } from 'react'
import { labelOf, tierName, tierOfModule } from './model.ts'
import { Contained, Cross, moduleHref, Notice, plural, tint, useView } from './parts.tsx'
import type { Edge, Violation } from './types.ts'

export interface OpenSource {
  file: string
  line: number
  // Undefined while loading, null when it cannot be read.
  text: string | null | undefined
}

// A light highlight: single-quoted strings, comments, keywords.
const TOKEN =
  /('[^']*')|(\/\/.*$)|\b(?:import|export|from|const|let|async|await|function|return|type|interface|if|else|new|throw)\b/g

function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const match of line.matchAll(TOKEN)) {
    out.push(line.slice(last, match.index))
    const kind = match[1] !== undefined ? 's' : match[2] !== undefined ? 'c' : 'k'
    out.push(
      <span className={kind} key={match.index}>
        {match[0]}
      </span>,
    )
    last = match.index + match[0].length
  }
  out.push(line.slice(last))
  return out
}

// The colours as equal bands, top to bottom: the bar of a line reaching several tiers.
function bands(colours: string[]): string {
  const step = 100 / colours.length
  return `linear-gradient(${colours.map((c, k) => `${c} ${k * step}% ${(k + 1) * step}%`).join(', ')})`
}

// A use of an imported name, in the colour of the tier its import reaches.
interface Mark {
  column: number
  endColumn: number
  colour: string | undefined
}

// The highlight, each use cut out of it and marked. A use two imports share (a
// namespace through a barrel) is marked once.
function marked(line: string, marks: Mark[]): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const mark of marks) {
    if (mark.column < last) {
      continue
    }
    out.push(<Fragment key={last}>{highlight(line.slice(last, mark.column))}</Fragment>)
    out.push(
      <span className="use" key={`use${mark.column}`} style={{ '--uc': mark.colour } as CSSProperties}>
        {line.slice(mark.column, mark.endColumn)}
      </span>,
    )
    last = mark.endColumn
  }
  out.push(<Fragment key={last}>{highlight(line.slice(last))}</Fragment>)
  return out
}

interface SourcePanelProps {
  // The file last opened, kept while the panel slides out.
  open: OpenSource | undefined
  visible: boolean
  snapshot: boolean
  // Changes with each report: the code drawn wrong from one is tried again.
  attempt: unknown
  onClose: () => void
}

// The file's lines alone, highlighted: what the panel shows when the report
// cannot be read to mark them, with why at its head.
function PlainCode({ text }: { text: string | null | undefined }) {
  return (
    <>
      <Notice title="Shown without its imports marked">
        The analyzer's report is not in this view's format; the warning above says how to fix it.
      </Notice>
      {typeof text === 'string' ? (
        <pre>
          {text
            .split('\n')
            .map((line, at) => ({ line, n: at + 1 }))
            .map(({ line, n }) => (
              <div key={n} className="l">
                <span>{n}</span>
                <span>{line === '' ? ' ' : highlight(line)}</span>
              </div>
            ))}
        </pre>
      ) : null}
    </>
  )
}

// The file's lines, its imports, breaches and uses marked. Drawn apart from
// the panel, so a report it cannot read leaves the panel open with a message.
function Code({
  open,
  edges,
  breaches,
  hidden,
  snapshot,
}: {
  open: OpenSource
  edges: Edge[]
  breaches: Violation[]
  hidden: ReadonlySet<string>
  snapshot: boolean
}) {
  const { model } = useView()
  const marks = Map.groupBy(
    edges
      .filter((e) => !hidden.has(e.to))
      .flatMap((e) => e.uses.map((u) => ({ ...u, colour: model.colour[tierOfModule(model, e.to)] })))
      .sort((a, b) => a.column - b.column),
    (u) => u.line,
  )
  // A breach on an import is annotated after the import's last line.
  const noteLine = (line: number) => edges.find((e) => e.line === line)?.endLine ?? line
  const scrollToTarget = (element: HTMLDivElement | null) => {
    element?.scrollIntoView?.({ block: 'center' })
  }
  let body: ReactNode = null
  if (open.text === null) {
    body = (
      <p className="empty">
        {snapshot
          ? 'The snapshot does not hold this file.'
          : 'The analyzer does not serve this file: it reads only the sources it analyzed.'}
      </p>
    )
  } else if (open.text !== undefined) {
    body = (
      <pre>
        {open.text.split('\n').map((text, i) => {
          const n = i + 1
          const covering = edges.filter((e) => e.line <= n && n <= e.endLine)
          const broken = breaches.filter((v) => v.line === n || covering.some((e) => e.line === v.line))
          const imports = covering.filter((e) => !hidden.has(e.to))
          const notes = breaches.filter((v) => noteLine(v.line) === n)
          // A line reaching several tiers (a barrel) credits each of them, none alone.
          const colours = [...new Set(imports.map((e) => model.colour[tierOfModule(model, e.to)] ?? ''))]
          const style =
            colours.length === 0
              ? undefined
              : colours.length === 1
                ? { '--tc': colours[0] }
                : { '--tc': 'var(--mute)', '--bar': bands(colours) }
          const classes = [
            'l',
            broken.length > 0 ? 'breach-line' : imports.length > 0 ? 'imp-line' : '',
            n === open.line ? 'target' : '',
          ]
          return (
            <div
              key={n}
              className={classes.filter(Boolean).join(' ')}
              style={style as CSSProperties | undefined}
              ref={n === open.line ? scrollToTarget : undefined}
            >
              <span>{n}</span>
              <span>{text === '' ? ' ' : marked(text, marks.get(n) ?? [])}</span>
              {broken.length === 0
                ? imports
                    .filter((e) => e.endLine === n)
                    .map((e) => (
                      <span className="go" key={e.to}>
                        imports <a href={moduleHref(e.to)}>{labelOf(model, e.to)}</a>,{' '}
                        {tierName(model, tierOfModule(model, e.to))}
                      </span>
                    ))
                : null}
              {notes.map((v) => (
                <div className="note" key={v.rule}>
                  <b>Breach, {v.rule}.</b> {v.message}
                  <br />
                  {v.fix}
                </div>
              ))}
            </div>
          )
        })}
      </pre>
    )
  }
  return body
}

export function SourcePanel({ open, visible, snapshot, attempt, onClose }: SourcePanelProps) {
  const { model } = useView()
  const file = open?.file ?? ''
  const edges = model.report.edges.filter((e) => e.file === file)
  const breaches = model.report.violations.filter((v) => v.file === file)
  // The modules the file imports, in the order of their first import.
  const modules = [...new Set([...edges].sort((a, b) => a.line - b.line).map((e) => e.to))]
  // The modules hidden from the legend, for the file they were hidden in.
  const [hiding, setHiding] = useState({ file, ids: new Set<string>() })
  const hidden = hiding.file === file ? hiding.ids : new Set<string>()
  const toggle = (id: string) =>
    setHiding((last) => {
      const ids = new Set(last.file === file ? last.ids : [])
      if (!ids.delete(id)) {
        ids.add(id)
      }
      return { file, ids }
    })
  return (
    <aside className={`src${visible ? ' open' : ''}`} aria-label="Source">
      {open === undefined ? null : (
        <>
          <header>
            <span className="path mono">{file}</span>
            <span className="mute">
              {plural(edges.length, 'import')}
              {breaches.length > 0 ? (
                <>
                  ,{' '}
                  <span className="breach-count">
                    {breaches.length} breach{breaches.length === 1 ? '' : 'es'}
                  </span>
                </>
              ) : null}
            </span>
            <button type="button" className="close" onClick={onClose}>
              <Cross /> Close
            </button>
            {modules.length === 0 ? null : (
              <fieldset className="legend" aria-label="Imported modules">
                {modules.map((id) => {
                  const shown = !hidden.has(id)
                  return (
                    <button
                      type="button"
                      key={id}
                      className="item"
                      aria-pressed={shown}
                      title={`${shown ? 'Hide' : 'Show'} the imports of ${labelOf(model, id)}`}
                      style={tint(model.colour[tierOfModule(model, id)])}
                      onClick={() => toggle(id)}
                    >
                      <span className="stn" />
                      {labelOf(model, id)}
                    </button>
                  )
                })}
              </fieldset>
            )}
          </header>
          <Contained
            attempt={`${file} ${open.line} ${String(attempt)}`}
            fallback={<PlainCode text={open.text} />}
          >
            <Code open={open} edges={edges} breaches={breaches} hidden={hidden} snapshot={snapshot} />
          </Contained>
        </>
      )}
    </aside>
  )
}
