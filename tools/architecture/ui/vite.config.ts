// The view builds into static files the analyzer serves from its watch mode.
// Relative paths, so the same build can be served from any path.
//
// A static page from a snapshot: write the report, then build with it:
//   architecture json --base main > report.json
//   SNAPSHOT=report.json vite build --outDir snapshot

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { analyzerIdentity, analyzerSources } from '../analyzer/identity.mjs'
import { embedSnapshot } from './src/snapshot.ts'

// What main.tsx names to receive the identity of the analyzer's sources the
// view is built with, and the format of the report it reads.
const IDENTITY = '__ANALYZER_IDENTITY__'
const FORMAT = '__REPORT_FORMAT__'
const analyzer = join(import.meta.dirname, '..', 'analyzer')
const format = join(import.meta.dirname, 'report.schema.json')

// Writes both into the module that names them, read again whenever one of the
// analyzer's sources or the format changes, so a view rebuilt in watch mode
// keeps up.
function identity(): Plugin {
  return {
    name: 'analyzer-identity',
    transform(code) {
      if (!code.includes(IDENTITY)) {
        return undefined
      }
      for (const source of analyzerSources(analyzer)) {
        this.addWatchFile(join(analyzer, source))
      }
      this.addWatchFile(format)
      return code
        .replaceAll(IDENTITY, JSON.stringify(analyzerIdentity(analyzer) ?? null))
        .replaceAll(FORMAT, readFileSync(format, 'utf8'))
    },
  }
}

function snapshot(file: string | undefined): Plugin {
  return {
    name: 'snapshot',
    transformIndexHtml: (html) =>
      file === undefined ? html : embedSnapshot(html, readFileSync(file, 'utf8')),
  }
}

export default defineConfig({
  plugins: [react(), snapshot(process.env['SNAPSHOT']), identity()],
  base: './',
})
