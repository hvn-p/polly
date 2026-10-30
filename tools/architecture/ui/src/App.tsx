// The view's shell: the top bar (repository, branch against its base, live
// status, tabs, counts), the trail of views visited, the current view, and the
// source panel.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Feed, FeedState } from './feed.ts'
import { readSeen, writeSeen } from './feed.ts'
import { type DiffLine, type FormatGap, formatDiff, formatGap } from './format.ts'
import { Matrix, type Selection } from './Matrix.tsx'
import { buildModel, type Folds, labelOf, type Model } from './model.ts'
import { BreachesPage, ChangesPage, ModulePage, RulesPage } from './pages.tsx'
import { BackArrow, Contained, ViewContext } from './parts.tsx'
import { crumbsOf, type Page, parseRoute, trailAfter } from './route.ts'
import { type OpenSource, SourcePanel } from './Source.tsx'
import type { Identity } from './types.ts'

const TABS: [Page, string][] = [
  ['matrix', 'Matrix'],
  ['breaches', 'Breaches'],
  ['changes', 'Changes'],
  ['rules', 'Rules'],
]

const current = () => window.location.hash || '#/matrix'

function useNavigation() {
  const [state, setState] = useState(() => ({ hash: current(), trail: [current()] }))
  useEffect(() => {
    const onChange = () => setState((s) => ({ hash: current(), trail: trailAfter(s.trail, current()) }))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return state
}

// Re-renders every few seconds, so "updated N s ago" stays true.
function useClock(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function liveText(state: FeedState, now: number): string {
  if (state.status === 'snapshot') {
    return 'snapshot'
  }
  if (state.status === 'offline') {
    return 'disconnected, retrying'
  }
  if (state.status === 'connecting' || state.updatedAt === undefined) {
    return 'connecting'
  }
  const seconds = Math.max(0, Math.round((Math.max(now, Date.now()) - state.updatedAt) / 1000))
  const ago =
    seconds < 5 ? 'just now' : seconds < 60 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`
  return `watching, updated ${ago}`
}

// The first pair holding a breach, so the view opens on what needs attention.
function firstBreach(model: Model): Selection | undefined {
  const edge = model.report.edges.find((e) => model.breachesOf(e).length > 0)
  return edge === undefined ? undefined : { kind: 'pair', from: edge.from, to: edge.to }
}

// A time as the gap shows it: its date and its minute.
function at(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

// What an identity is built from, field by field, so the gap with the other
// side can stand out where it is.
type Fields = { commit: string; date: string; local: string; sources: string }

function fieldsOf({ fingerprint, commit, date, modified, changed }: Identity): Fields {
  const local = !modified
    ? 'no local changes'
    : changed === undefined
      ? 'local changes'
      : `local changes ${at(changed)}`
  // The fingerprint tells apart two builds whose other fields are the same.
  return { commit, date: at(date), local, sources: `sources ${fingerprint.slice(0, 7)}` }
}

function Built({ fields, other }: { fields: Fields; other: Fields | undefined }) {
  const shown = (name: keyof Fields) => (
    <span className={other?.[name] === fields[name] ? undefined : 'differs'}>{fields[name]}</span>
  )
  return (
    <dd>
      {shown('commit')}
      {shown('date')}
      {shown('local')}
      {shown('sources')}
    </dd>
  )
}

// How far the analyzer serving the view is from it: built from other sources,
// or sending another format, which the view then reads wrong.
type Gap = { level: 'sources' } | { level: 'format'; fields: FormatGap | undefined; diff: DiffLine[] }

function gapOf(
  state: FeedState,
  identity: Identity | null,
  format: Record<string, unknown> | null,
): Gap | undefined {
  if (format !== null && state.analyzerFormat !== undefined) {
    if (state.analyzerFormat === null) {
      return { level: 'format', fields: undefined, diff: [] }
    }
    const fields = formatGap(format, state.analyzerFormat)
    if (fields !== undefined) {
      return { level: 'format', fields, diff: formatDiff(format, state.analyzerFormat) }
    }
  }
  return identity !== null &&
    state.analyzer !== undefined &&
    state.analyzer?.fingerprint !== identity.fingerprint
    ? { level: 'sources' }
    : undefined
}

// The two formats line by line, folded until asked for: what the view reads
// as removed, what the analyzer sends as added.
function FormatDiff({ lines }: { lines: DiffLine[] }) {
  const numbered = lines.map((line, at) => ({ ...line, at }))
  const classOf = { ' ': 'line', '-': 'line removed', '+': 'line added', '…': 'line folded' } as const
  return (
    <details className="format-diff">
      <summary>Show the format difference</summary>
      <p className="legend">
        <span className="removed">- what this view reads</span>
        <span className="added">+ what the analyzer sends</span>
      </p>
      <pre>
        {numbered.map((line) => (
          <span key={line.at} className={classOf[line.kind]}>
            {line.kind === '…' ? '…' : `${line.kind} ${line.text}`}
          </span>
        ))}
      </pre>
    </details>
  )
}

// Shown for as long as the analyzer serving the view was built from other
// sources than the view; graver when it sends another format, which the view
// then shows wrong. It cannot be dismissed: the gap holds until the analyzer
// is rebuilt.
function VersionWarning({
  gap,
  analyzer,
  view,
}: {
  gap: Gap
  analyzer: Identity | null | undefined
  view: Identity | null
}) {
  const served = analyzer === null || analyzer === undefined ? undefined : fieldsOf(analyzer)
  const expected = view === null ? undefined : fieldsOf(view)
  const grave = gap.level === 'format'
  return (
    <section
      className={grave ? 'version-warning format' : 'version-warning'}
      role="alert"
      aria-labelledby="version-warning-title"
    >
      <h2 id="version-warning-title">
        <span className="mark" aria-hidden="true" />
        {grave
          ? "The analyzer's report is not in this view's format"
          : 'The analyzer was built from other sources than this view'}
      </h2>
      <p className="consequence">
        {grave
          ? 'What the view shows is wrong or missing until the analyzer is rebuilt.'
          : 'What the view shows may be wrong or missing.'}
      </p>
      <dl>
        {gap.level === 'format' ? (
          gap.fields === undefined ? (
            <>
              <dt>Format</dt>
              <dd>
                <span className="differs">no format: built before formats existed</span>
              </dd>
            </>
          ) : (
            <>
              {gap.fields.missing.length > 0 ? (
                <>
                  <dt>Not sent</dt>
                  <dd>
                    <span className="differs">{gap.fields.missing.join(', ')}</span>
                  </dd>
                </>
              ) : null}
              {gap.fields.unknown.length > 0 ? (
                <>
                  <dt>Unknown here</dt>
                  <dd>
                    <span className="differs">{gap.fields.unknown.join(', ')}</span>
                  </dd>
                </>
              ) : null}
              {gap.fields.missing.length === 0 && gap.fields.unknown.length === 0 ? (
                <>
                  <dt>Format</dt>
                  <dd>
                    <span className="differs">the same fields, with other types or bounds</span>
                  </dd>
                </>
              ) : null}
            </>
          )
        ) : null}
        <dt>Analyzer</dt>
        {served === undefined ? (
          <dd>
            <span className="differs">no version: built before versions existed, or without Node</span>
          </dd>
        ) : (
          <Built fields={served} other={expected} />
        )}
        {expected === undefined ? null : (
          <>
            <dt>This view</dt>
            <Built fields={expected} other={served} />
          </>
        )}
      </dl>
      {gap.level === 'format' && gap.diff.length > 0 ? <FormatDiff lines={gap.diff} /> : null}
      <p className="fix">
        Run <code>cargo build --release</code> in <code>tools/architecture/analyzer</code>, then restart the
        analyzer.
      </p>
    </section>
  )
}

// identity: the analyzer's sources this view was built from; null when its
// build could not read them.
// format: the format of the analyzer's report this view was built to read.
export function App({
  feed,
  identity = null,
  format = null,
}: {
  feed: Feed
  identity?: Identity | null
  format?: Record<string, unknown> | null
}) {
  const state = useSyncExternalStore(feed.subscribe, feed.get)
  const gap = gapOf(state, identity, format)
  const model = useMemo(
    () => (state.report === undefined ? undefined : buildModel(state.report)),
    [state.report],
  )
  const { hash, trail } = useNavigation()
  const now = useClock()
  const [seen, setSeen] = useState(readSeen)
  const [folds, setFolds] = useState<Folds | undefined>()
  const [selection, setSelection] = useState<Selection | undefined>()
  const [zoom, setZoom] = useState(1)
  const [source, setSource] = useState<OpenSource | undefined>()
  const [sourceShown, setSourceShown] = useState(false)

  const openSource = useCallback(
    (file: string, line: number) => {
      setSource({ file, line, text: undefined })
      setSourceShown(true)
      void feed.source(file).then((text) => {
        setSource((s) => (s?.file === file ? { ...s, text: text ?? null } : s))
      })
    },
    [feed],
  )
  useEffect(() => {
    const close = () => setSourceShown(false)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('hashchange', close)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('hashchange', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  const view = useMemo(() => (model === undefined ? undefined : { model, openSource }), [model, openSource])

  const route = parseRoute(hash)
  const tab = route.page === 'module' ? parseRoute(trail[0] ?? '#/matrix').page : route.page
  const unseen = state.history.filter((c) => c.at > seen).length
  const markSeen = () => {
    const last = Math.max(seen, ...state.history.map((c) => c.at))
    writeSeen(last)
    setSeen(last)
  }
  const labelOfHash = (h: string) => {
    const r = parseRoute(h)
    return r.page === 'module' && model !== undefined
      ? labelOf(model, r.arg ?? '')
      : (TABS.find(([page]) => page === r.page)?.[1] ?? 'Matrix')
  }
  const base = state.report?.base
  const crumbs = crumbsOf(trail)

  return (
    <>
      <div className="app">
        <header className="top">
          <span className="brand">architecture</span>
          {state.report?.name ? <span className="repo">{state.report.name}</span> : null}
          {base ? (
            <span className="branch">
              <b>{base.head ?? 'this tree'}</b> against {base.ref}
            </span>
          ) : null}
          <span className={`live ${state.status}`} title="Rebuilt on every saved file">
            {liveText(state, now)}
          </span>
          <nav className="tabs" aria-label="Views">
            {TABS.map(([page, label]) => {
              const count =
                page === 'breaches' && model !== undefined && model.report.violations.length > 0 ? (
                  <span className="count breach">{model.report.violations.length}</span>
                ) : page === 'changes' && unseen > 0 ? (
                  <span className="count new">{unseen}</span>
                ) : null
              return (
                <a key={page} href={`#/${page}`} aria-current={tab === page ? 'page' : undefined}>
                  {label}
                  {count}
                </a>
              )
            })}
          </nav>
          {model === undefined ? null : (
            <span className="stats">
              {model.modules.length} modules · {model.report.edges.length} imports · {model.tiers.length}{' '}
              tiers
            </span>
          )}
        </header>
        <div className="notices">
          {gap === undefined ? null : <VersionWarning gap={gap} analyzer={state.analyzer} view={identity} />}
        </div>
        <nav className="crumbs" aria-label="Where you are">
          <button
            type="button"
            className="back"
            disabled={trail.length < 2}
            onClick={() => window.history.back()}
          >
            <BackArrow />
            Back
          </button>
          {crumbs.map((h, k) =>
            h === null ? (
              <span className="sep" key="gap">
                …
              </span>
            ) : k === crumbs.length - 1 ? (
              <span className="here" key={h}>
                {labelOfHash(h)}
              </span>
            ) : (
              <span key={h}>
                <a href={h}>{labelOfHash(h)}</a>
                <span className="sep">›</span>
              </span>
            ),
          )}
        </nav>
        <main className="view">
          {view === undefined ? (
            <p className="waiting">Waiting for the analyzer’s first report…</p>
          ) : (
            <ViewContext.Provider value={view}>
              <Contained attempt={`${hash} ${state.updatedAt}`}>
                {route.page === 'module' ? (
                  <ModulePage id={route.arg ?? ''} />
                ) : route.page === 'breaches' ? (
                  <BreachesPage />
                ) : route.page === 'changes' ? (
                  <ChangesPage history={state.history} seen={seen} onSeen={markSeen} />
                ) : route.page === 'rules' ? (
                  <RulesPage tier={route.arg} />
                ) : (
                  <Matrix
                    folds={folds ?? { groups: view.model.foldedGroups, tiers: new Set() }}
                    onFolds={setFolds}
                    selection={selection ?? firstBreach(view.model)}
                    onSelect={setSelection}
                    zoom={zoom}
                    onZoom={setZoom}
                  />
                )}
              </Contained>
            </ViewContext.Provider>
          )}
        </main>
      </div>
      {view === undefined ? null : (
        <ViewContext.Provider value={view}>
          <SourcePanel
            open={source}
            visible={sourceShown}
            snapshot={state.status === 'snapshot'}
            attempt={state.updatedAt}
            onClose={() => setSourceShown(false)}
          />
        </ViewContext.Provider>
      )}
    </>
  )
}
