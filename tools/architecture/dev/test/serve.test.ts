// The analyzer's Compose project, started and stopped through serve.ts on
// this checkout, under project names of its own.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { serve, stop } from '../serve.ts'

const tool = join(import.meta.dirname, '..', '..')
const checkout = join(tool, '..', '..')
const pinned = JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8')).devDependencies[
  '@hvn-p/architecture'
] as string
const run = Math.random().toString(16).slice(2, 8)
const projects: string[] = []

afterAll(async () => {
  for (const project of projects) {
    await stop(project)
  }
})

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  if (typeof address !== 'object' || address === null) {
    throw new Error('no free port')
  }
  return address.port
}

function settings(name: string, port: number) {
  const project = `architecture-test-${run}-${name}`
  projects.push(project)
  return {
    project,
    root: checkout,
    port,
    allowHost: `arch.${name}.test.localhost`,
    logs: mkdtempSync(join(tmpdir(), 'architecture-logs-')),
    // The base a shallow CI checkout has.
    base: 'HEAD',
  }
}

function containersOf(project: string): string {
  return execFileSync(
    'docker',
    ['ps', '--all', '--quiet', '--filter', `label=com.docker.compose.project=${project}`],
    {
      encoding: 'utf8',
    },
  ).trim()
}

function get(port: number, path: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const sent = request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => {
        body += chunk
      })
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }))
    })
    sent.on('error', reject)
    sent.end()
  })
}

describe("the analyzer's project", { timeout: 600_000 }, () => {
  it('C78: from a published version holding no view, refuses ARCHITECTURE_VIEW_UNAVAILABLE and leaves no container', async () => {
    const options = settings('package', await freePort())
    await expect(serve({ ...options, from: { version: pinned } })).rejects.toMatchObject({
      code: 'ARCHITECTURE_VIEW_UNAVAILABLE',
    })
    expect(containersOf(options.project)).toBe('')
  })

  it('C79: from the sources, serves the view built from them with the identity of their analyzer, and stops', async () => {
    const options = settings('source', await freePort())
    await serve({ ...options, from: { source: tool } })
    const page = await get(options.port, '/', options.allowHost)
    expect(page.status).toBe(200)
    expect(page.body).toContain('<div id="root">')
    const identity = execFileSync(process.execPath, [join(tool, 'analyzer/identity.mjs')], {
      encoding: 'utf8',
    })
    const version = (await get(options.port, '/version.json', options.allowHost)).body
    expect(JSON.parse(version)).toEqual(JSON.parse(identity))
    await stop(options.project)
    expect(containersOf(options.project)).toBe('')
  })
})
