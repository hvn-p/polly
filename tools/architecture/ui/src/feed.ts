// Where the view's data comes from: the analyzer's watch mode (the report and
// each change pushed as server-sent events, the session's history, the analyzed
// files), or a snapshot built into the page, which may hold the same.

import type { Snapshot } from './snapshot.ts'
import type { Change, Identity, Report } from './types.ts'

export interface FeedState {
  report: Report | undefined
  history: Change[]
  status: 'connecting' | 'live' | 'offline' | 'snapshot'
  // When the last report arrived, in milliseconds since the epoch.
  updatedAt: number | undefined
  // The sources the serving analyzer was built from, and the format of what it
  // sends: null when it reports none, undefined until it answers, or for a
  // snapshot.
  analyzer?: Identity | null
  analyzerFormat?: Record<string, unknown> | null
}

export interface Feed {
  get: () => FeedState
  subscribe: (listener: () => void) => () => void
  // An analyzed file's content, or nothing when it cannot be read.
  source: (file: string) => Promise<string | undefined>
  close: () => void
}

function store(initial: FeedState) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set: (next: Partial<FeedState>) => {
      state = { ...state, ...next }
      for (const listener of listeners) {
        listener()
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export interface LiveOptions {
  fetch: (url: string) => Promise<Response>
  EventSource: typeof EventSource
  now: () => number
}

export function liveFeed({ fetch, EventSource, now }: LiveOptions): Feed {
  const state = store({ report: undefined, history: [], status: 'connecting', updatedAt: undefined })
  const events = new EventSource('/events')
  // On each connection, the history it may have missed, and the analyzer's
  // identity, since another build may have taken over.
  events.onopen = () => {
    void fetch('/version.json')
      .then((response) => (response.ok ? (response.json() as Promise<Identity | null>) : null))
      .catch(() => null)
      .then((analyzer) => state.set({ analyzer }))
    void fetch('/report.schema.json')
      .then((response) => (response.ok ? (response.json() as Promise<Record<string, unknown>>) : null))
      .catch(() => null)
      .then((analyzerFormat) => state.set({ analyzerFormat }))
    void fetch('/history.json')
      .then((response) => (response.ok ? (response.json() as Promise<Change[]>) : undefined))
      .then((history) => {
        if (history !== undefined) {
          state.set({ history })
        }
      })
  }
  events.onerror = () => state.set({ status: 'offline' })
  events.addEventListener('graph', (event) => {
    state.set({ report: JSON.parse(event.data) as Report, status: 'live', updatedAt: now() })
  })
  events.addEventListener('change', (event) => {
    state.set({ history: [...state.get().history, JSON.parse(event.data) as Change] })
  })
  return {
    get: state.get,
    subscribe: state.subscribe,
    source: async (file) => {
      const response = await fetch(`/source/${file.split('/').map(encodeURIComponent).join('/')}`)
      return response.ok ? response.text() : undefined
    },
    close: () => events.close(),
  }
}

export function snapshotFeed(snapshot: Report | Snapshot): Feed {
  // A bare report holds nothing else.
  const {
    report,
    history = [],
    sources = {},
    ...versions
  } = 'report' in snapshot ? snapshot : { report: snapshot }
  const state = store({ report, history, status: 'snapshot', updatedAt: undefined, ...versions })
  return {
    get: state.get,
    subscribe: state.subscribe,
    source: async (file) => (Object.hasOwn(sources, file) ? sources[file] : undefined),
    close: () => {},
  }
}

// The time of the last change the viewer marked as seen, kept in this browser
// only; 0 when none, or when the browser keeps nothing.
const SEEN = 'architecture:seen'

export function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN) ?? 0)
  } catch {
    return 0
  }
}

export function writeSeen(at: number): void {
  try {
    localStorage.setItem(SEEN, String(at))
  } catch {
    // Nothing kept: the changes show as new again on the next visit.
  }
}
