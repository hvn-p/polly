import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'

const lockModule = join(import.meta.dirname, '..', '..', 'src', 'machine', 'lock.ts')

// Another process holding a lock through the dev commands' own lock, until it
// is killed or the given seconds pass.
export async function holdLock(path: string, seconds = 30): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        `import { lock } from ${JSON.stringify(lockModule)}`,
        `await lock(${JSON.stringify(path)})`,
        "console.log('held')",
        `setTimeout(() => process.exit(0), ${seconds * 1000})`,
      ].join('\n'),
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  await once(child.stdout, 'data')
  return child
}
