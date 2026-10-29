#!/usr/bin/env node
// Runs the analyzer built for this machine, from the platform package npm
// installed next to this one, with the same arguments and exit status.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
const run = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' })
process.exit(run.status ?? 1)
