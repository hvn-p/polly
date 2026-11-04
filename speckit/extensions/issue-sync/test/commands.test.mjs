import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'vitest'
import { Failure, main, renderArchive, renderComment, writeTasks } from '../scripts/issue-sync.mjs'
import { fakeTools } from './fake-tools.mjs'

const issue = {
  title: 'Freeze behaviour',
  body: 'The intent.',
  url: 'https://example.com/189',
  state: 'OPEN',
}

/**
 * @param {number} id
 * @param {string} body
 */
function comment(id, body) {
  return { id, body, user: { login: 'alice' }, created_at: `2026-10-1${id}T09:00:00Z` }
}

/** @type {ReturnType<typeof fakeTools> | undefined} */
let tools
const directory = process.cwd()

beforeEach(() => {
  process.chdir(mkdtempSync(join(tmpdir(), 'issue-sync-')))
  mkdirSync('.specify')
})

afterEach(() => {
  tools?.restore()
  process.chdir(directory)
})

test("a pull restores the artifacts, the context and the branch's tasks into the issue's cache", () => {
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [
      comment(1, renderComment('spec.md', 'The spec.')),
      comment(2, 'A decision.'),
      comment(3, renderComment('contracts/api.md', 'The contract.')),
      comment(4, renderComment('assess/intake.md', 'Not this flow.')),
    ],
    pullRequests: [{ number: 8, body: writeTasks('Closes #189', '- [ ] T001\n') }],
  })
  const result = main(['pull'])

  const dir = '.specify/tmp/issue-189'
  assert.deepEqual(result, {
    issue: 189,
    pr: 8,
    dir,
    restored: ['spec.md', 'contracts/api.md', 'assess/intake.md', 'tasks.md (PR #8)'],
  })
  assert.equal(readFileSync(join(dir, 'spec.md'), 'utf8'), 'The spec.')
  assert.equal(readFileSync(join(dir, 'contracts/api.md'), 'utf8'), 'The contract.')
  assert.equal(readFileSync(join(dir, 'tasks.md'), 'utf8'), '- [ ] T001\n')
  assert.match(readFileSync(join(dir, 'issue.md'), 'utf8'), /The intent\.[\s\S]*A decision\./)
  assert.deepEqual(JSON.parse(readFileSync('.specify/feature.json', 'utf8')), { feature_directory: dir })
})

test('a pull into a given directory under a prefix restores only that flow, and neither the tasks nor the feature', () => {
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [
      comment(1, renderComment('spec.md', 'The spec.')),
      comment(2, renderComment('assess/intake.md', 'Intake.')),
    ],
    pullRequests: [{ number: 8, body: writeTasks('', '- [ ] T001\n') }],
  })
  const result = main(['pull', '189', '--dir', 'elsewhere', '--prefix', 'assess/'])

  assert.deepEqual(result, { issue: 189, pr: null, dir: 'elsewhere', restored: ['assess/intake.md'] })
  assert.equal(readFileSync('elsewhere/intake.md', 'utf8'), 'Intake.')
  assert.throws(() => readFileSync('.specify/feature.json'))
})

test("a pull for another issue than the branch's leaves the branch's pull request alone", () => {
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [],
    pullRequests: [{ number: 8, body: writeTasks('', 'x') }],
  })
  const result = main(['pull', '190'])
  assert.ok('pr' in result)
  assert.equal(result.pr, null)
})

test('a push creates the new artifacts, updates the changed, sends the tasks and notes what changed', () => {
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [comment(1, renderComment('spec.md', 'Same.')), comment(2, renderComment('plan.md', 'Old.'))],
    pullRequests: [{ number: 8, body: 'Closes #189' }],
  })
  const dir = '.specify/tmp/issue-189'
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'issue.md'), 'context, never pushed')
  writeFileSync(join(dir, 'spec.md'), 'Same.')
  writeFileSync(join(dir, 'plan.md'), 'New.')
  writeFileSync(join(dir, 'research.md'), 'Fresh.')
  writeFileSync(join(dir, 'notes.bin'), 'not a text artifact')
  writeFileSync(join(dir, 'tasks.md'), '- [x] T001\n')

  const result = main(['push', '--note', 'Plan: done.'])

  assert.deepEqual(result, {
    issue: 189,
    dir,
    created: ['research.md'],
    changed: ['plan.md', 'research.md', 'tasks.md (PR #8)'],
  })
  assert.deepEqual(tools.state().writes, [
    {
      method: 'PATCH',
      path: 'repos/{owner}/{repo}/issues/comments/2',
      body: renderComment('plan.md', 'New.'),
    },
    {
      method: 'POST',
      path: 'repos/{owner}/{repo}/issues/189/comments',
      body: renderComment('research.md', 'Fresh.'),
    },
    {
      method: 'PATCH',
      path: 'repos/{owner}/{repo}/pulls/8',
      body: writeTasks('Closes #189', '- [x] T001\n'),
    },
    {
      method: 'POST',
      path: 'repos/{owner}/{repo}/issues/189/comments',
      body: 'Spec Kit: Plan: done.\n\nArtifacts updated: `plan.md`, `research.md`, `tasks.md (PR #8)`.',
    },
  ])
})

test('a push that changes nothing writes nothing, not even its note', () => {
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [comment(1, renderComment('spec.md', 'Same.'))],
    pullRequests: [{ number: 8, body: writeTasks('', '- [x] T001\n') }],
  })
  const dir = '.specify/tmp/issue-189'
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'spec.md'), 'Same.')
  writeFileSync(join(dir, 'tasks.md'), '- [x] T001\n')

  assert.deepEqual(main(['push', '--note', 'Nothing.']), { issue: 189, dir, created: [], changed: [] })
  assert.deepEqual(tools.state().writes, [])
})

/** @param {number} number @param {boolean} done */
function bigPhase(number, done) {
  return `## Phase ${number}: Convergence\n\n- [${done ? 'X' : ' '}] T${number}00 ${'w'.repeat(25000)}\n\n`
}

const bigTasks = `# Tasks\n\n${bigPhase(10, true)}${bigPhase(11, true)}${bigPhase(12, true)}${bigPhase(13, false)}`

test('a push of tasks over the limit archives completed phases in a comment of the pull request, which a pull restores', () => {
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [],
    pullRequests: [{ number: 8, body: 'Closes #189' }],
  })
  const dir = '.specify/tmp/issue-189'
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'tasks.md'), bigTasks)

  const pushed = main(['push'])
  assert.ok('changed' in pushed)
  assert.deepEqual(pushed.changed, ['tasks.md (PR #8)'])

  const [archive, description] = tools.state().writes
  assert.deepEqual(archive, {
    method: 'POST',
    path: 'repos/{owner}/{repo}/issues/8/comments',
    body: renderArchive(bigPhase(10, true) + bigPhase(11, true)),
  })
  assert.equal(description?.path, 'repos/{owner}/{repo}/pulls/8')
  assert.ok((description?.body.length ?? 0) <= 65536)
  assert.match(
    description?.body ?? '',
    /Phases 10 to 11, done, are archived in \[a comment of this pull request\]\(https:\/\/github\.com\/o\/r\/pull\/8#issuecomment-9001\)/,
  )

  const state = tools.state()
  tools.restore()
  tools = fakeTools({ ...state, pullRequests: [{ number: 8, body: description?.body ?? '' }] })
  writeFileSync(join(dir, 'tasks.md'), 'stale')
  main(['pull'])
  assert.equal(readFileSync(join(dir, 'tasks.md'), 'utf8'), bigTasks)
})

test('a push updates the archive the description points to, and leaves it alone when unchanged', () => {
  const archived = renderArchive(bigPhase(10, true))
  const pointer =
    '<!-- speckit-tasks-archive: 55 -->\nPhase 10, done, is archived in [a comment of this pull request](https://github.com/o/r/pull/8#issuecomment-55).\n<!-- speckit-tasks-archive:end -->\n'
  const kept = `# Tasks\n\n${pointer}${bigPhase(11, true)}${bigPhase(12, false)}`
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [],
    pullComments: [{ id: 55, body: archived, user: null, created_at: 't' }],
    pullRequests: [{ number: 8, body: writeTasks('', kept) }],
  })
  const dir = '.specify/tmp/issue-189'
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'tasks.md'),
    `# Tasks\n\n${bigPhase(10, true)}${bigPhase(11, true)}${bigPhase(12, false)}`,
  )
  const unchanged = main(['push'])
  assert.ok('changed' in unchanged)
  assert.deepEqual(unchanged.changed, [])
  assert.deepEqual(tools.state().writes, [])

  const grown = `# Tasks\n\n${bigPhase(10, true)}${bigPhase(11, true)}${bigPhase(12, true)}${bigPhase(13, false)}`
  writeFileSync(join(dir, 'tasks.md'), grown)
  main(['push'])
  const [archive, description] = tools.state().writes
  assert.deepEqual(archive, {
    method: 'PATCH',
    path: 'repos/{owner}/{repo}/issues/comments/55',
    body: renderArchive(bigPhase(10, true) + bigPhase(11, true)),
  })
  assert.match(description?.body ?? '', /Phases 10 to 11, done, are archived/)
})

test('a pull whose archive comment is gone is refused, naming it', () => {
  const pointer = '<!-- speckit-tasks-archive: 55 -->\nx\n<!-- speckit-tasks-archive:end -->\n'
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [],
    pullRequests: [{ number: 8, body: writeTasks('', pointer) }],
  })
  assert.throws(() => main(['pull']), /issues\/comments\/55 failed: HTTP 404/)
})

test('a push into a given directory under a prefix names its comments with the prefix and sends no tasks', () => {
  tools = fakeTools({ branch: '189-freeze', issue, comments: [], pullRequests: [] })
  mkdirSync('elsewhere')
  writeFileSync('elsewhere/intake.md', 'Intake.')
  writeFileSync('elsewhere/tasks.md', 'not the feature tasks')

  const result = main(['push', '189', '--dir', 'elsewhere', '--prefix', 'assess/'])

  assert.ok('created' in result)
  assert.deepEqual(result.created, ['assess/intake.md', 'assess/tasks.md'])
})

test('tasks without a pull request to hold them are refused', () => {
  tools = fakeTools({ branch: '189-freeze', issue, comments: [], pullRequests: [] })
  mkdirSync('.specify/tmp/issue-189', { recursive: true })
  writeFileSync('.specify/tmp/issue-189/tasks.md', '- [ ] T001\n')
  assert.throws(() => main(['push']), /tasks\.md has nowhere to go: work on a branch named 189-<slug>/)
})

test('a branch that names no issue is refused, unless the issue is given', () => {
  tools = fakeTools({ branch: 'main', issue, comments: [], pullRequests: [] })
  assert.throws(() => main(['pull']), /branch "main" names no issue/)
  assert.equal(main(['pull', '189']).issue, 189)
})

test('a failing gh is reported with what it printed', () => {
  tools = fakeTools({
    branch: '189-freeze',
    issue,
    comments: [],
    pullRequests: [],
    fail: 'HTTP 401: Bad credentials',
  })
  assert.throws(
    () => main(['pull']),
    (error) => error instanceof Failure && /HTTP 401: Bad credentials/.test(error.message),
  )
})

test('malformed arguments are refused, naming what is wrong', () => {
  tools = fakeTools({ branch: '189-freeze', issue, comments: [], pullRequests: [] })
  assert.throws(() => main(['pull', '--dir']), /--dir needs a value/)
  assert.throws(() => main(['pull', 'nope']), /unexpected argument: nope/)
  assert.throws(() => main(['pull', '--prefix', '../up/']), /--prefix is a plain relative directory/)
  assert.throws(() => main(['sync']), /usage: issue-sync\.mjs pull\|push/)
})
