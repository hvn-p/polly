#!/usr/bin/env node
// Runs the analyzer built for this machine, from the platform package npm
// installed next to this one, with the same arguments and exit status. In
// watch mode, it serves the view this package carries unless given another.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { name } = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'))
const platform = `${process.platform}-${process.arch}`

let binary
try {
  binary = require.resolve(`${name}-${platform}/bin/architecture-analyzer`)
} catch {
  process.stderr.write(
    `ARCHITECTURE_PLATFORM_UNSUPPORTED: no prebuilt analyzer for ${platform}; build it with cargo in tools/architecture/analyzer\n`,
  )
  process.exit(1)
}
const args = process.argv.slice(2)
const view = join(import.meta.dirname, '..', 'view')
if (args[0] === 'watch' && !args.includes('--ui') && existsSync(view)) {
  args.push('--ui', view)
}
const run = spawnSync(binary, args, { stdio: 'inherit' })
process.exit(run.status ?? 1)
