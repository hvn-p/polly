// The view's shell: the top bar (repository, branch against its base, live
// status, tabs, counts), the trail of views visited, the current view, and the
// source panel.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Feed, FeedState } from './feed.ts'
import { readSeen, writeSeen } from './feed.ts'
import { Matrix, type Selection } from './Matrix.tsx'
import { buildModel, type Folds, labelOf, type Model } from './model.ts'
import { BreachesPage, ChangesPage, ModulePage, RulesPage } from './pages.tsx'
import { BackArrow, ViewContext } from './parts.tsx'
import { crumbsOf, type Page, parseRoute, trailAfter } from './route.ts'
import { type OpenSource, SourcePanel } from './Source.tsx'

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

export function App({ feed }: { feed: Feed }) {
  const state = useSyncExternalStore(feed.subscribe, feed.get)
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
            onClose={() => setSourceShown(false)}
          />
        </ViewContext.Provider>
      )}
    </>
  )
}
