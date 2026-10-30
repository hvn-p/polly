// Fake `gh` and `git` executables, put first on the PATH of a test, so that
// the commands run against a GitHub and a branch the test describes. `gh`
// serves the issue, its comments and the branch's pull requests from a JSON
// state file and records every write in it.

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

/**
 * @typedef {{ id: number, body: string, user: { login: string } | null, created_at: string }} RemoteComment
 * @typedef {{
 *   branch: string,
 *   issue: { title: string, body: string | null, url: string, state: string },
 *   comments: RemoteComment[],
 *   pullRequests: { number: number, body: string | null }[],
 *   fail?: string,
 *   writes: { method: string, path: string, body: string }[],
 * }} State
 */

const GH = `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('node:fs')
const file = process.env.FAKE_GH_STATE
const state = JSON.parse(readFileSync(file, 'utf8'))
const args = process.argv.slice(2)
if (state.fail) {
  process.stderr.write(state.fail)
  process.exit(1)
}
if (args[0] === 'issue' && args[1] === 'view') {
  console.log(JSON.stringify(state.issue))
} else if (args[0] === 'pr' && args[1] === 'list') {
  console.log(JSON.stringify(state.pullRequests))
} else if (args[0] === 'api' && args.includes('--method')) {
  const method = args[args.indexOf('--method') + 1]
  const path = args.find((arg) => arg.startsWith('repos/'))
  const { body } = JSON.parse(readFileSync(0, 'utf8'))
  state.writes.push({ method, path, body })
  writeFileSync(file, JSON.stringify(state))
  console.log('{}')
} else if (args[0] === 'api') {
  console.log(JSON.stringify([state.comments]))
} else {
  process.stderr.write('fake gh: unexpected ' + args.join(' '))
  process.exit(1)
}
`

const GIT = `#!/usr/bin/env node
const { readFileSync } = require('node:fs')
console.log(JSON.parse(readFileSync(process.env.FAKE_GH_STATE, 'utf8')).branch)
`

/**
 * Installs the fakes with the given state; returns how to read the state back.
 * @param {Omit<State, 'writes'>} initial
 */
export function fakeTools(initial) {
  const directory = mkdtempSync(join(tmpdir(), 'issue-sync-tools-'))
  const bin = join(directory, 'bin')
  mkdirSync(bin)
  for (const [name, source] of Object.entries({ gh: GH, git: GIT })) {
    writeFileSync(join(bin, name), source)
    chmodSync(join(bin, name), 0o755)
  }
  const file = join(directory, 'state.json')
  writeFileSync(file, JSON.stringify({ ...initial, writes: [] }))
  const previous = { path: process.env['PATH'], state: process.env['FAKE_GH_STATE'] }
  process.env['PATH'] = `${bin}${delimiter}${previous.path ?? ''}`
  process.env['FAKE_GH_STATE'] = file
  return {
    /** @returns {State} */
    state: () => JSON.parse(readFileSync(file, 'utf8')),
    restore: () => {
      process.env['PATH'] = previous.path
      if (previous.state === undefined) delete process.env['FAKE_GH_STATE']
      else process.env['FAKE_GH_STATE'] = previous.state
    },
  }
}
