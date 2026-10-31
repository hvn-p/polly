import { afterEach, describe, expect, it, vi } from 'vitest'
import { liveFeed, readSeen, snapshotFeed, writeSeen } from './feed.ts'
import { fixture } from './test/fixture.ts'
import type { Change } from './types.ts'

class FakeEvents {
  static last: FakeEvents | undefined
  listeners = new Map<string, ((event: MessageEvent) => void)[]>()
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
    FakeEvents.last = this
  }
  addEventListener(name: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }
  emit(name: string, data: unknown) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener(new MessageEvent(name, { data: JSON.stringify(data) }))
    }
  }
  close() {
    this.closed = true
  }
}

const change: Change = { at: 5, files: ['a.ts'], added: [], removed: [], breaches: [], fixed: [] }

function respond(routes: Record<string, { status: number; body: string }>) {
  return vi.fn(async (url: string) => {
    const route = routes[url] ?? { status: 404, body: 'not found' }
    return new Response(route.body, { status: route.status })
  })
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  localStorage.clear()
})

describe('the live feed', () => {
  it("reads the analyzer's identity on each connection, null when it reports none", async () => {
    const identity = {
      fingerprint: 'f1',
      commit: 'abc1234',
      date: '2026-10-30T00:33:00+01:00',
      modified: false,
    }
    const format = { type: 'object', properties: {} }
    const fetch = respond({
      '/version.json': { status: 200, body: JSON.stringify(identity) },
      '/report.schema.json': { status: 200, body: JSON.stringify(format) },
    })
    const feed = liveFeed({ fetch, EventSource: FakeEvents as unknown as typeof EventSource, now: () => 42 })
    expect(feed.get().analyzer).toBeUndefined()
    FakeEvents.last?.onopen?.()
    await tick()
    expect(feed.get().analyzer).toEqual(identity)
    expect(feed.get().analyzerFormat).toEqual(format)

    const older = liveFeed({
      fetch: respond({}),
      EventSource: FakeEvents as unknown as typeof EventSource,
      now: () => 42,
    })
    FakeEvents.last?.onopen?.()
    await tick()
    expect(older.get().analyzer).toBeNull()
    expect(older.get().analyzerFormat).toBeNull()
  })

  it('takes the report from the event stream and the history from the server', async () => {
    const fetch = respond({ '/history.json': { status: 200, body: JSON.stringify([change]) } })
    const feed = liveFeed({ fetch, EventSource: FakeEvents as unknown as typeof EventSource, now: () => 42 })
    const seen: string[] = []
    const unsubscribe = feed.subscribe(() => seen.push(feed.get().status))
    expect(feed.get()).toMatchObject({ status: 'connecting', history: [] })
    expect(FakeEvents.last?.url).toBe('/events')

    FakeEvents.last?.onopen?.()
    await tick()
    expect(feed.get().history).toEqual([change])

    FakeEvents.last?.emit('graph', fixture())
    expect(feed.get()).toMatchObject({ status: 'live', updatedAt: 42 })
    expect(feed.get().report?.name).toBe('shop')

    const next = { ...change, at: 6 }
    FakeEvents.last?.emit('change', next)
    expect(feed.get().history).toEqual([change, next])

    FakeEvents.last?.onerror?.()
    expect(feed.get().status).toBe('offline')
    expect(seen).toContain('live')

    unsubscribe()
    feed.close()
    expect(FakeEvents.last?.closed).toBe(true)
  })

  it('reads an analyzed file, and nothing for a refused one', async () => {
    const fetch = respond({ '/source/src/b%20c.ts': { status: 200, body: 'export {}\n' } })
    const feed = liveFeed({ fetch, EventSource: FakeEvents as unknown as typeof EventSource, now: Date.now })
    expect(await feed.source('src/b c.ts')).toBe('export {}\n')
    expect(await feed.source('secret.txt')).toBeUndefined()
  })

  it('keeps its history when the server has none to give', async () => {
    const fetch = respond({})
    const feed = liveFeed({ fetch, EventSource: FakeEvents as unknown as typeof EventSource, now: Date.now })
    FakeEvents.last?.emit('change', change)
    FakeEvents.last?.onopen?.()
    await tick()
    expect(feed.get().history).toEqual([change])
  })
})

describe('the snapshot feed', () => {
  it('holds one report, no history and no sources', async () => {
    const feed = snapshotFeed(fixture())
    expect(feed.get()).toMatchObject({ status: 'snapshot', history: [] })
    expect(feed.get().report?.name).toBe('shop')
    expect(await feed.source('apps/api/src/main.ts')).toBeUndefined()
    feed.subscribe(() => {})()
    feed.close()
  })

  it('holds what a live analyzer served too: its history, its version and format, and the sources it kept', async () => {
    const history: Change[] = [
      { at: 1, files: ['apps/api/src/main.ts'], added: [], removed: [], breaches: [], fixed: [] },
    ]
    const analyzer = { fingerprint: 'f', commit: 'c', date: '2026-10-30T00:00:00+01:00', modified: false }
    const feed = snapshotFeed({
      report: fixture(),
      history,
      sources: { 'apps/api/src/main.ts': 'import x\n' },
      analyzer,
      analyzerFormat: { type: 'object' },
    })
    expect(feed.get()).toMatchObject({
      status: 'snapshot',
      history,
      analyzer,
      analyzerFormat: { type: 'object' },
    })
    expect(feed.get().report?.name).toBe('shop')
    expect(await feed.source('apps/api/src/main.ts')).toBe('import x\n')
    expect(await feed.source('apps/web/src/app.tsx')).toBeUndefined()
    expect(await feed.source('constructor')).toBeUndefined()
  })
})

describe('what the viewer has seen', () => {
  it('remembers the last change marked as seen, and survives storage that refuses', () => {
    expect(readSeen()).toBe(0)
    writeSeen(7)
    expect(readSeen()).toBe(7)
    const get = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readSeen()).toBe(0)
    expect(() => writeSeen(8)).not.toThrow()
    get.mockRestore()
    set.mockRestore()
  })
})
