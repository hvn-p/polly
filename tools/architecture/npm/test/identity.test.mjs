import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { analyzerIdentity, localIso } from '../../analyzer/identity.mjs'

/** @param {string} directory */
function identityOf(directory) {
  const identity = analyzerIdentity(directory)
  assert.ok(identity, `no identity for ${directory}`)
  return identity
}

// A repository holding an analyzer's sources, committed once.
function repository() {
  const root = mkdtempSync(join(tmpdir(), 'identity-'))
  const git = (/** @type {string[]} */ ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '--quiet')
  const analyzer = join(root, 'tools/architecture/analyzer')
  mkdirSync(join(analyzer, 'src'), { recursive: true })
  mkdirSync(join(analyzer, 'target'))
  writeFileSync(join(analyzer, '.gitignore'), 'target/\n')
  writeFileSync(join(analyzer, 'Cargo.toml'), '[package]\nname = "a"\n')
  writeFileSync(join(analyzer, 'src/main.rs'), 'fn main() {}\n')
  writeFileSync(join(root, 'README.md'), 'readme\n')
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'analyzer')
  return { root, analyzer, git }
}

describe("the analyzer's identity", () => {
  it('writes a time with the offset it was taken in, as git writes a date', () => {
    const date = new Date('2026-10-30T06:47:50Z')
    const written = localIso(date)
    assert.match(written, /^2026-10-30T\d{2}:47:50[+-]\d{2}:\d{2}$/)
    assert.equal(new Date(written).getTime(), date.getTime())
  })

  it('names the last commit of its sources, unmodified', () => {
    const { analyzer, git } = repository()
    const identity = identityOf(analyzer)
    assert.equal(identity.commit, git('log', '-1', '--format=%h').trim())
    assert.match(identity.date, /^\d{4}-\d{2}-\d{2}T/)
    assert.equal(identity.modified, false)
    assert.equal(identity.changed, undefined)
    assert.match(identity.fingerprint, /^[0-9a-f]{64}$/)
  })

  it('changes its fingerprint with a source, an added file or a removed one, and says so', () => {
    const { analyzer } = repository()
    const committed = identityOf(analyzer)
    writeFileSync(join(analyzer, 'src/main.rs'), 'fn main() { println!() }\n')
    const edited = identityOf(analyzer)
    assert.notEqual(edited.fingerprint, committed.fingerprint)
    assert.equal(edited.modified, true)
    assert.equal(edited.commit, committed.commit)
    // When the latest local change was saved: what tells two such builds apart.
    assert.equal(edited.changed, localIso(statSync(join(analyzer, 'src/main.rs')).mtime))
    writeFileSync(join(analyzer, 'src/lib.rs'), '\n')
    assert.notEqual(identityOf(analyzer).fingerprint, edited.fingerprint)
  })

  it('ignores what does not build the analyzer: its build output, the rest of the repository', () => {
    const { root, analyzer } = repository()
    const committed = identityOf(analyzer)
    writeFileSync(join(analyzer, 'target/out'), 'built\n')
    writeFileSync(join(root, 'README.md'), 'changed\n')
    assert.deepEqual(identityOf(analyzer), committed)
  })

  it('is the same content for the same sources, whatever their commit', () => {
    const first = repository()
    const second = repository()
    assert.equal(identityOf(first.analyzer).fingerprint, identityOf(second.analyzer).fingerprint)
  })
})
