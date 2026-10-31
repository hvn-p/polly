// A static build of the view: a snapshot written into the page, which then
// reads it instead of a live analyzer. A snapshot is the analyzer's report, as
// `architecture json` prints it, or what a live analyzer serves, captured.

import type { Change, Identity, Report } from './types.ts'

// What a live analyzer serves its view, kept in the page.
export interface Snapshot {
  report: Report
  history?: Change[]
  // The content of some analyzed files, by their path from the root.
  sources?: Record<string, string>
  analyzer?: Identity | null
  analyzerFormat?: Record<string, unknown> | null
}

const PLACE = '<script type="application/json" id="snapshot"></script>'

export function embedSnapshot(html: string, report: string): string {
  if (!html.includes(PLACE)) {
    throw new Error('the page has no snapshot script to fill')
  }
  // Reformatted, so it is JSON; "<" escaped, so nothing in it closes the script.
  const json = JSON.stringify(JSON.parse(report)).replaceAll('<', '\\u003c')
  // A function, so a "$" in the report is never read as a replacement pattern.
  return html.replace(PLACE, () => PLACE.replace('></script>', () => `>${json}</script>`))
}

// Reads a watching analyzer (get answers a path of its server) into a snapshot:
// its report, the session's history, its version and format, and the content
// of each file a breach or a change names, and of the files given.
export async function captureSnapshot(
  get: (path: string) => Promise<Response>,
  files: string[] = [],
): Promise<Snapshot> {
  const read = async (path: string) => {
    const response = await get(path)
    return response.ok ? (response.json() as Promise<unknown>) : null
  }
  const graph = await get('/graph.json')
  if (!graph.ok) {
    throw new Error(`/graph.json: ${graph.status}`)
  }
  const report = (await graph.json()) as Report
  const history = ((await read('/history.json')) ?? []) as Change[]
  const named = [
    ...report.violations.map((v) => v.file),
    ...history.flatMap((change) => [...change.files, ...change.breaches.map((v) => v.file)]),
    ...files,
  ]
  const sources: Record<string, string> = {}
  for (const file of new Set(named)) {
    const response = await get(`/source/${file.split('/').map(encodeURIComponent).join('/')}`)
    if (response.ok) {
      sources[file] = await response.text()
    }
  }
  return {
    report,
    history,
    analyzer: (await read('/version.json')) as Identity | null,
    analyzerFormat: (await read('/report.schema.json')) as Record<string, unknown> | null,
    sources,
  }
}
