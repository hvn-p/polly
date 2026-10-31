import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED, checkRepository } from './refusals.mjs'

const repositoryRoot = join(import.meta.dirname, '..', '..')

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'refusals-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const valid = {
  'apps/api/src/refusals.ts':
    'export const refusalResponse = (r) => Response.json({ code: r.code }, { status: 403 })\nconst frame = (e) => `event: ` + e\n',
  'apps/api/src/agent-events/index.ts':
    "throw new Refusal('EVENT_CODE_REVOKED', 'revoked')\nsend(eventFrame(e))\n",
  'apps/api/src/routes.test.ts': "Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })\n",
  'apps/api/test/support/stub.ts': 'return new Response(null, { status: 502 })\n',
  'apps/mcp/src/refusals.ts': 'export const notFound = () => new Response(null, { status: 404 })\n',
  'apps/mcp/src/tools.ts': 'server.registerTool(tool.name, config, handle)\n',
  'packages/identity/src/index.ts': 'return new Response(null, { status: 204 })\n',
  'packages/identity/node_modules/x/index.js': 'return new Response(null, { status: 200 })\n',
  'packages/back/src/flows/read.ts': 'if (response.status === 401) {\n',
  'apps/api/src/contracts/api.ts': "getMe: { method: 'GET', status: 200 },\n",
  'packages/contract/src/generated.ts': "getMe: { method: 'GET', status: 200 },\n",
}

describe('refusals guard', () => {
  it('accepts the repository as it is', () => {
    expect(checkRepository(repositoryRoot)).toEqual([])
  })

  it('accepts answers built in the translation points only, tests and allowed files aside', () => {
    expect(checkRepository(fixture(valid))).toEqual([])
  })

  it('refuses a route that builds its own refusal response, naming each fix', () => {
    const root = fixture({
      ...valid,
      'apps/api/src/agent-events/index.ts':
        "return Response.json({ code: 'EVENT_CODE_REVOKED' }, { status: 403 })\n",
    })
    expect(checkRepository(root)).toEqual([
      expect.stringMatching(
        /^apps\/api\/src\/agent-events\/index\.ts:1: .*status.*apps\/api\/src\/refusals\.ts/,
      ),
      expect.stringMatching(/^apps\/api\/src\/agent-events\/index\.ts:1: .*throw a Refusal/),
    ])
  })

  it('refuses a status or a response written anywhere in apps/ and packages/', () => {
    const root = fixture({
      ...valid,
      'apps/api/src/learner/index.ts': 'return Response.json(value)\n',
      'apps/web/src/shared/fetch.ts': 'return new Response(body)\n',
      'packages/back/src/flows/answer.ts': 'const init = { status: 204 }\n',
      'packages/storage/src/redirect.ts': 'return Response.redirect(url)\n',
    })
    expect(checkRepository(root)).toEqual([
      expect.stringMatching(/^apps\/api\/src\/learner\/index\.ts:1: /),
      expect.stringMatching(/^apps\/web\/src\/shared\/fetch\.ts:1: /),
      expect.stringMatching(/^packages\/back\/src\/flows\/answer\.ts:1: .*status/),
      expect.stringMatching(/^packages\/storage\/src\/redirect\.ts:1: /),
    ])
  })

  it('refuses a response built in the contract, where only its statuses are written', () => {
    const root = fixture({
      ...valid,
      'apps/api/src/contracts/api.ts': 'export const ok = Response.json({})\n',
    })
    expect(checkRepository(root)).toEqual([expect.stringMatching(/^apps\/api\/src\/contracts\/api\.ts:1: /)])
  })

  it('refuses a refusal built in a stream frame outside the translation point', () => {
    const root = fixture({
      ...valid,
      'apps/api/src/agent-events/index.ts':
        'send(`event: error\\ndata: {"code":"EVENT_CODE_NOT_BOUND"}\\n\\n`)\n',
    })
    expect(checkRepository(root)).toEqual([
      expect.stringMatching(/^apps\/api\/src\/agent-events\/index\.ts:1: .*event-stream frame.*refusals\.ts/),
    ])
  })

  it('refuses an MCP tool that builds its own error result, or registers itself', () => {
    const root = fixture({
      ...valid,
      'apps/mcp/src/main.ts': "return { isError: true, content: [] }\nserver.registerTool('x', {}, cb)\n",
    })
    expect(checkRepository(root)).toEqual([
      expect.stringMatching(/^apps\/mcp\/src\/main\.ts:1: .*refusals\.ts/),
      expect.stringMatching(/^apps\/mcp\/src\/main\.ts:2: .*defineTool from tools\.ts/),
    ])
  })

  it('allows an exception only with its reason, on a file of the repository', () => {
    for (const [path, reason] of Object.entries(ALLOWED)) {
      expect(existsSync(join(repositoryRoot, path))).toBe(true)
      expect(reason.length).toBeGreaterThan(20)
    }
  })
})
