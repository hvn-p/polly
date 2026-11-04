import { describe, expect, it } from 'vitest'
import { captureSnapshot, embedSnapshot } from './snapshot.ts'
import { fixture } from './test/fixture.ts'
import type { Change } from './types.ts'

describe('a snapshot captured from a live analyzer', () => {
  const change: Change = {
    at: 1,
    files: ['apps/api/src/main.ts'],
    added: [],
    removed: [],
    breaches: [],
    fixed: [],
  }
  // What a watching analyzer serves, path by path.
  const served = (paths: Record<string, unknown>) => {
    const asked: string[] = []
    const get = async (path: string) => {
      asked.push(path)
      const body = paths[path]
      return body === undefined
        ? new Response('not found', { status: 404 })
        : new Response(typeof body === 'string' ? body : JSON.stringify(body))
    }
    return { get, asked }
  }

  it('holds its report, history, version, format, and the files its breaches, its changes and the caller name', async () => {
    const version = { fingerprint: 'f', commit: 'c', date: '2026-10-30T00:00:00+01:00', modified: false }
    const { get, asked } = served({
      '/graph.json': fixture(),
      '/history.json': [change],
      '/version.json': version,
      '/report.schema.json': { type: 'object' },
      '/source/packages/back/src/flows/buy/index.ts': 'buy\n',
      '/source/apps/web/src/app.tsx': 'app\n',
      '/source/apps/api/src/main.ts': 'main\n',
      '/source/apps/api/src/a%20b.ts': 'spaced\n',
    })
    const snapshot = await captureSnapshot(get, ['apps/api/src/a b.ts', 'apps/api/src/main.ts'])
    expect(snapshot).toEqual({
      report: fixture(),
      history: [change],
      analyzer: version,
      analyzerFormat: { type: 'object' },
      sources: {
        'packages/back/src/flows/buy/index.ts': 'buy\n',
        'apps/web/src/app.tsx': 'app\n',
        'apps/api/src/main.ts': 'main\n',
        'apps/api/src/a b.ts': 'spaced\n',
      },
    })
    // Each file read once, though a breach, a change and the caller name it.
    expect(asked.filter((path) => path === '/source/apps/api/src/main.ts')).toHaveLength(1)
  })

  it('leaves out what the analyzer does not serve, and refuses one with no report', async () => {
    const { get } = served({ '/graph.json': { ...fixture(), violations: [] }, '/version.json': null })
    expect(await captureSnapshot(get)).toEqual({
      report: { ...fixture(), violations: [] },
      history: [],
      analyzer: null,
      analyzerFormat: null,
      sources: {},
    })
    await expect(captureSnapshot(served({}).get)).rejects.toThrow('/graph.json: 404')
  })
})

const page = '<body><div id="root"></div><script type="application/json" id="snapshot"></script></body>'

describe('a snapshot built into the page', () => {
  it('holds the report the view reads back', () => {
    const html = embedSnapshot(page, JSON.stringify(fixture()))
    const document = new DOMParser().parseFromString(html, 'text/html')
    const text = document.getElementById('snapshot')?.textContent ?? ''
    expect(JSON.parse(text)).toEqual(fixture())
  })

  it('cannot close its script, whatever the report says', () => {
    const report = { ...fixture(), name: '</script><script>alert(1)</script>' }
    const html = embedSnapshot(page, JSON.stringify(report))
    expect(html).not.toContain('</script><script>alert')
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(document.querySelectorAll('script')).toHaveLength(1)
    expect(JSON.parse(document.getElementById('snapshot')?.textContent ?? '').name).toBe(report.name)
  })

  it('keeps a report that holds replacement patterns as it is', () => {
    const report = { ...fixture(), name: "a$'b$$c$&d$`e" }
    const html = embedSnapshot(page, JSON.stringify(report))
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(JSON.parse(document.getElementById('snapshot')?.textContent ?? '')).toEqual(report)
  })

  it('refuses a page without its place, or a report that is not JSON', () => {
    expect(() => embedSnapshot('<body></body>', '{}')).toThrow('no snapshot script')
    expect(() => embedSnapshot(page, 'not json')).toThrow()
  })
})
