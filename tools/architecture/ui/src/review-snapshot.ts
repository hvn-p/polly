// Writes the snapshot a design review captures the view's breach states from:
// the repository at HEAD, cloned aside and watched by the local analyzer build,
// one breach planted once the watch has started (so it is a change of the
// session too), and the analyzer's sources marked as other than the view's (so
// the stale-analyzer warning shows). Uncommitted changes are left out.
//
//   node tools/architecture/ui/src/review-snapshot.ts <snapshot.json>
//
// Then build the view from it, as from any snapshot (see vite.config.ts).

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { captureSnapshot } from './snapshot.ts'
import type { Change } from './types.ts'

// A domain importing a flow: one tier breach, and nothing else.
const PLANT = {
  file: 'packages/back/src/domains/accounts/index.ts',
  line: "import { startLesson } from '../../flows/start-lesson/index.ts'",
}

const out = process.argv[2]
if (out === undefined) {
  console.error('usage: node tools/architecture/ui/src/review-snapshot.ts <snapshot.json>')
  process.exit(2)
}
const root = join(import.meta.dirname, '..', '..', '..', '..')
const analyzer = join(root, 'tools/architecture/analyzer/target/release/architecture-analyzer')
if (!existsSync(analyzer)) {
  console.error('No local analyzer build: run cargo build --release in tools/architecture/analyzer.')
  process.exit(2)
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

// Asks again every 100 ms, for 30 s at most, until the answer is there.
async function until<T>(what: string, probe: () => Promise<T | undefined>): Promise<T> {
  for (let tries = 0; tries < 300; tries++) {
    const found = await probe().catch(() => undefined)
    if (found !== undefined) {
      return found
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`no ${what} after 30 s`)
}

const clone = mkdtempSync(join(tmpdir(), 'architecture-review-'))
try {
  git('clone', '--quiet', '--shared', '--no-checkout', root, clone)
  git(
    '-C',
    clone,
    'checkout',
    '--quiet',
    '-B',
    git('branch', '--show-current') || 'review',
    git('rev-parse', 'HEAD'),
  )
  git('-C', clone, 'update-ref', 'refs/heads/main', git('rev-parse', 'main'))
  // Each package's installed dependencies, so its imports resolve as here.
  for (const manifest of git('ls-files', 'package.json', '**/package.json').split('\n')) {
    const modules = join(dirname(manifest), 'node_modules')
    if (existsSync(join(root, modules)) && existsSync(join(clone, dirname(manifest)))) {
      symlinkSync(join(root, modules), join(clone, modules))
    }
  }
  const watching = spawn(analyzer, ['watch', '--root', clone, '--base', 'main'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  try {
    // The analyzer prints its address on its first line.
    const address = await new Promise<string>((resolve, reject) => {
      createInterface({ input: watching.stdout }).once('line', (line) => resolve(line.trim()))
      watching.once('exit', (code) => reject(new Error(`the analyzer exited with ${code}`)))
    })
    const get = (path: string) => fetch(`${address}${path}`)
    await until('first report', async () => ((await get('/graph.json')).ok ? true : undefined))
    // Before the file's first import, where only comments can come before it.
    const file = join(clone, PLANT.file)
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.splice(
      Math.max(
        0,
        lines.findIndex((line) => line.startsWith('import ')),
      ),
      0,
      PLANT.line,
    )
    writeFileSync(file, lines.join('\n'))
    await until('planted breach in the history', async () => {
      const history = (await (await get('/history.json')).json()) as Change[]
      return history.some((change) => change.breaches.length > 0) ? true : undefined
    })
    const snapshot = await captureSnapshot(get, [PLANT.file])
    if (snapshot.analyzer) {
      snapshot.analyzer = { ...snapshot.analyzer, fingerprint: 'planted' }
    }
    writeFileSync(out, JSON.stringify(snapshot))
    console.log(`${out}: ${snapshot.report.violations.length} breach, ${snapshot.history?.length} change`)
  } finally {
    watching.kill()
  }
} finally {
  rmSync(clone, { recursive: true, force: true })
}
