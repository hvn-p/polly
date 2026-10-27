import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkRefusals } from './refusals.mjs'

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
  'entry/refusals.ts':
    'export const refusalResponse = (r) => Response.json({ code: r.code }, { status: 403 })\nexport const toolRefusal = (r) => ({ isError: true })\n',
  'entry/mcp/index.ts': 'server.registerTool(definition.name, config, handle)\n',
  'entry/access.ts': 'return new Response(null, { status: 204 })\n',
  'entry/agent-events/index.ts': "throw new Refusal('EVENT_CODE_REVOKED', 'revoked')\n",
  'entry/routes.test.ts': "Response.json({ code: 'UNAUTHORIZED' }, { status: 401 })\n",
}

describe('refusals guard', () => {
  it('accepts the API as it is', () => {
    expect(checkRefusals(join(repositoryRoot, 'apps/api/src'))).toEqual([])
  })

  it('accepts refusals thrown, translated in entry/refusals.ts only', () => {
    expect(checkRefusals(fixture(valid))).toEqual([])
  })

  it('refuses a route that builds its own refusal response, naming the fix', () => {
    const root = fixture({
      ...valid,
      'entry/agent-events/index.ts':
        "return Response.json({ code: 'EVENT_CODE_REVOKED' }, { status: 403 })\n",
    })
    expect(checkRefusals(root)).toEqual([
      expect.stringMatching(/^entry\/agent-events\/index\.ts:1: .*throw a Refusal.*entry\/refusals\.ts/),
    ])
  })

  it('refuses a tool that builds its own error result, or registers itself', () => {
    const root = fixture({
      ...valid,
      'entry/mcp/start-lesson.ts':
        "return { isError: true, content: [] }\nserver.registerTool('x', {}, cb)\n",
    })
    expect(checkRefusals(root)).toEqual([
      expect.stringMatching(/^entry\/mcp\/start-lesson\.ts:1: /),
      expect.stringMatching(/^entry\/mcp\/start-lesson\.ts:2: .*defineTool/),
    ])
  })
})
