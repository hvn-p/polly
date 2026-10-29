import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkRefusals, checkRepository, PROCESSES } from './refusals.mjs'

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
  'refusals.ts': 'export const refusalResponse = (r) => Response.json({ code: r.code }, { status: 403 })\n',
  'access.ts': 'return new Response(null, { status: 204 })\n',
  'agent-events/index.ts': "throw new Refusal('EVENT_CODE_REVOKED', 'revoked')\n",
  'routes.test.ts': "Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })\n",
}

describe('refusals guard', () => {
  it('accepts the repository as it is', () => {
    expect(checkRepository(repositoryRoot)).toEqual([])
  })

  it('accepts refusals thrown, translated in refusals.ts only', () => {
    expect(checkRefusals(fixture(valid))).toEqual([])
  })

  it('refuses a route that builds its own refusal response, naming the fix', () => {
    const root = fixture({
      ...valid,
      'agent-events/index.ts': "return Response.json({ code: 'EVENT_CODE_REVOKED' }, { status: 403 })\n",
    })
    expect(checkRefusals(root)).toEqual([
      expect.stringMatching(/^agent-events\/index\.ts:1: .*throw a Refusal.*refusals\.ts/),
    ])
  })

  it('refuses an MCP tool that builds its own error result, or registers itself', () => {
    const root = fixture({
      'refusals.ts': 'export const toolResult = () => ({ isError: true })\n',
      'tools.ts': 'server.registerTool(tool.name, config, handle)\n',
      'main.ts': "return { isError: true, content: [] }\nserver.registerTool('x', {}, cb)\n",
    })
    expect(checkRefusals(root, PROCESSES['apps/mcp/src'])).toEqual([
      expect.stringMatching(/^main\.ts:1: .*refusals\.ts/),
      expect.stringMatching(/^main\.ts:2: .*defineTool from tools\.ts/),
    ])
  })
})
