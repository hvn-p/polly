// Starts the view on the analyzer that serves it, or on the snapshot a static
// build wrote into the page.

import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { liveFeed, snapshotFeed } from './feed.ts'
import type { Snapshot } from './snapshot.ts'
import type { Report } from './types.ts'

const snapshot = document.getElementById('snapshot')?.textContent
const feed =
  snapshot === undefined || snapshot === null || snapshot.trim() === ''
    ? liveFeed({ fetch: (url) => fetch(url), EventSource, now: Date.now })
    : snapshotFeed(JSON.parse(snapshot) as Report | Snapshot)

const root = document.getElementById('root')
if (root !== null) {
  createRoot(root).render(<App feed={feed} identity={__ANALYZER_IDENTITY__} format={__REPORT_FORMAT__} />)
}
