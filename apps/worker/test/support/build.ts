// The worker runs from its build, as in production: each test builds the
// processes it spawns, into dist/test.

import { join } from 'node:path'
import { bundleProcess } from '../../../../scripts/build/processes.ts'

const built = join(import.meta.dirname, '..', '..', 'dist', 'test')

// The worker's composition root, and the worker with its fake analyzer slowed
// down, so a test can kill it in the middle of a task.
const ENTRIES = {
  main: join(import.meta.dirname, '..', '..', 'src', 'main.ts'),
  'slow-worker': join(import.meta.dirname, 'slow-worker.ts'),
}

export async function buildWorker(name: keyof typeof ENTRIES): Promise<string> {
  const outfile = join(built, `${name}.js`)
  await bundleProcess({ entry: ENTRIES[name], outfile })
  return outfile
}

// What every process writes once it has started.
export const STARTED = '"event":"logging.process.started"'
