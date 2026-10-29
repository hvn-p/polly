import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUNDLES } from '../build/bundles.ts'
import { checkBundles } from './bundles.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')

describe('bundles guard', () => {
  it('accepts the repository as it is', async () => {
    expect(await checkBundles(repositoryRoot, BUNDLES)).toEqual([])
  })

  it('C65: fails naming the bundle when the committed copy differs from its sources', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bundles-'))
    for (const bundle of BUNDLES) {
      cpSync(join(repositoryRoot, bundle.output), join(root, bundle.output), { recursive: true })
    }
    const [monitor] = BUNDLES
    const path = join(root, monitor?.output ?? '')
    writeFileSync(path, `${readFileSync(path, 'utf8')}// edited\n`)
    expect(await checkBundles(root, BUNDLES)).toEqual([
      `${monitor?.output} differs from ${monitor?.entry}; run nr bundles, never edit a bundle`,
    ])
    expect(dirname(monitor?.output ?? '')).toBe('plugin/monitors')
  })
})
