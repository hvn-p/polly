// The view builds into static files the analyzer serves from its watch mode.
// Relative paths, so the same build can be served from any path.
//
// A static page from a snapshot: write the report, then build with it:
//   architecture json --base main > report.json
//   SNAPSHOT=report.json vite build --outDir snapshot

import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { embedSnapshot } from './src/snapshot.ts'

function snapshot(file: string | undefined): Plugin {
  return {
    name: 'snapshot',
    transformIndexHtml: (html) =>
      file === undefined ? html : embedSnapshot(html, readFileSync(file, 'utf8')),
  }
}

export default defineConfig({
  plugins: [react(), snapshot(process.env['SNAPSHOT'])],
  base: './',
})
