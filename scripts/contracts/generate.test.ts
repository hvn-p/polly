import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { checkContracts } from '../checks/contracts.mjs'
import { CONTRACTS, type Contract, generate, type Operation, render } from './generate.ts'

const repositoryRoot = join(import.meta.dirname, '..', '..')

const event = z.object({ type: z.literal('test') })
const refusal = z.object({
  code: z.enum(['UNAUTHORIZED', 'INVALID_EVENT_CODE', 'EVENT_CODE_REVOKED', 'EVENT_CODE_NOT_BOUND']),
  reason: z.string().max(512).optional(),
})
const contract: Contract = {
  name: 'events',
  source: 'api/events.ts',
  load: async () => ({ Event: event, Refusal: refusal }),
  operations: async () => ({
    getEvent: { method: 'GET', path: '/events', access: 'public', response: event, refusals: [] },
  }),
  openapi: 'web/openapi.json',
  client: 'plugin/generated.ts',
}

const json = (name: string) => ({
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
})
const computeDocument = {
  openapi: '3.1.0',
  info: { title: 'compute', version: '0' },
  paths: {
    '/analyses': {
      post: {
        operationId: 'analyze',
        requestBody: { required: true, ...json('AnalysisRequest') },
        responses: { '200': json('Analysis'), '422': json('Detail') },
      },
    },
  },
  components: {
    schemas: {
      AnalysisRequest: {
        type: 'object',
        properties: { recordingId: { type: 'string', maxLength: 64 } },
        required: ['recordingId'],
      },
      Analysis: {
        type: 'object',
        properties: { score: { type: 'number', minimum: 0, maximum: 1 } },
        required: ['score'],
      },
      Detail: { type: 'object' },
    },
  },
}
const compute: Contract = {
  name: 'compute',
  source: 'compute/app.py',
  load: async () => ({}),
  document: async () => JSON.stringify(computeDocument),
  openapi: 'compute/openapi.json',
  client: 'analysis/src/generated.ts',
}

function freshRoot(): string {
  return mkdtempSync(join(tmpdir(), 'contracts-'))
}

describe('contract generation', () => {
  it('writes an OpenAPI document another language publishes, and its client, references named', async () => {
    const files = await render(compute)
    expect(JSON.parse(files.get('compute/openapi.json') ?? '')).toEqual(computeDocument)
    const client = files.get('analysis/src/generated.ts') ?? ''
    expect(client).toContain('export type AnalysisRequest = { recordingId: string }')
    expect(client).toContain('export type Detail = Record<string, unknown>')
    expect(client).toContain('analyze: { body: AnalysisRequest; response: Analysis }')
    expect(client).toContain("analyze: { method: 'POST', path: '/analyses', refusals: [] }")
    expect(client).not.toContain('Streams')
  })

  it('accepts the repository as it is', async () => {
    expect(await checkContracts(repositoryRoot, CONTRACTS)).toEqual([])
  })
})

const learner = z.object({ learnerId: z.string().max(64) })
const code = z.object({ code: z.string().length(43) })
const agentEvent = z.discriminatedUnion('type', [z.object({ type: z.literal('test') })])
const api: Contract = {
  name: 'api',
  source: 'api/contract.ts',
  load: async () => ({ Learner: learner, Code: code, AgentEvent: agentEvent, Refusal: refusal }),
  operations: async (): Promise<Record<string, Operation>> => ({
    getMe: {
      method: 'GET',
      path: '/api/me',
      access: 'learner',
      response: learner,
      refusals: ['UNAUTHORIZED'],
    },
    bindEventCode: {
      method: 'POST',
      path: '/api/event-codes',
      access: 'learner',
      body: code,
      response: z.object({ bound: z.literal(true) }),
      refusals: ['UNAUTHORIZED', 'INVALID_EVENT_CODE'],
    },
    agentEvents: {
      method: 'GET',
      path: '/api/agent-events',
      access: 'event-code',
      events: agentEvent,
      refusals: ['EVENT_CODE_REVOKED'],
    },
  }),
  openapi: 'contract/openapi.json',
  client: 'contract/src/generated.ts',
}

describe('API contract generation', () => {
  it('writes the OpenAPI document of the operations, their refusals and the schemas', async () => {
    const document = JSON.parse((await render(api)).get('contract/openapi.json') ?? '')
    expect(document.openapi).toBe('3.1.0')
    const bind = document.paths['/api/event-codes'].post
    expect(bind.operationId).toBe('bindEventCode')
    expect(bind['x-access']).toBe('learner')
    expect(bind.requestBody.content['application/json'].schema.properties.code).toMatchObject({
      maxLength: 43,
    })
    const refused = bind.responses.default.content['application/json'].schema
    expect(refused.properties.code.enum).toEqual(['UNAUTHORIZED', 'INVALID_EVENT_CODE'])
    expect(refused.properties.reason).toMatchObject({ type: 'string', maxLength: 512 })
    expect(refused.required).toEqual(['code'])
    expect(document.paths['/api/agent-events'].get.responses['200'].content).toHaveProperty(
      'text/event-stream',
    )
    expect(Object.keys(document.components.schemas)).toEqual(['Learner', 'Code', 'AgentEvent', 'Refusal'])
  })

  it('writes the client types: one per schema, the operations, the streams and every refusal code', async () => {
    const client = (await render(api)).get('contract/src/generated.ts') ?? ''
    expect(client).toMatch(/^\/\/ Generated by nr contracts from api\/contract\.ts/)
    expect(client).toContain('export type Learner = { learnerId: string }')
    expect(client).toContain("export type AgentEvent = { type: 'test' }")
    expect(client).toContain('bindEventCode: { body: { code: string }; response: { bound: true } }')
    expect(client).toContain('getMe: { body: undefined; response: { learnerId: string } }')
    expect(client).toContain("agentEvents: { path: '/api/agent-events'")
    expect(client.replace(/\s+/g, ' ')).toContain(
      "export const REFUSAL_CODES = [ 'EVENT_CODE_NOT_BOUND', 'EVENT_CODE_REVOKED', 'INVALID_EVENT_CODE', 'UNAUTHORIZED', ] as const",
    )
  })

  it("refuses an operation's refusal that the Refusal schema does not list, or a contract without one", async () => {
    const stray: Contract = {
      ...api,
      operations: async () => ({
        getMe: { method: 'GET', path: '/api/me', access: 'learner', response: learner, refusals: ['GONE'] },
      }),
    }
    await expect(render(stray)).rejects.toThrow(
      'api: getMe refuses with GONE, which the Refusal schema does not list',
    )
    const bare: Contract = { ...api, load: async () => ({ Learner: learner }) }
    await expect(render(bare)).rejects.toThrow('api: an API contract defines its Refusal schema')
  })

  it("lists each stream's event types and refusals, for a client that checks them at runtime", async () => {
    const client = (await render(api)).get('contract/src/generated.ts') ?? ''
    expect(client).toContain(
      "agentEvents: { path: '/api/agent-events', refusals: ['EVENT_CODE_REVOKED'], events: ['test'] }",
    )
  })

  it('C65: the guard names the API contract when its generated client was edited', async () => {
    const root = freshRoot()
    await generate(root, [api])
    expect(await checkContracts(root, [api])).toEqual([])
    const path = join(root, 'contract/src/generated.ts')
    writeFileSync(path, readFileSync(path, 'utf8').replace('learnerId: string', 'learnerId: number'))
    expect(await checkContracts(root, [api])).toEqual([
      expect.stringMatching(/^api: contract\/src\/generated\.ts differs from api\/contract\.ts/),
    ])
  })
})

describe('contract guard', () => {
  it('accepts generated copies that match their source', async () => {
    const root = freshRoot()
    await generate(root, [contract])
    expect(await checkContracts(root, [contract])).toEqual([])
  })

  it('C65: fails naming the contract when a generated copy was edited by hand', async () => {
    const root = freshRoot()
    await generate(root, [contract])
    const path = join(root, 'web/openapi.json')
    writeFileSync(path, readFileSync(path, 'utf8').replace('"test"', '"edited"'))
    expect(await checkContracts(root, [contract])).toEqual([
      expect.stringMatching(/^events: web\/openapi\.json differs from api\/events\.ts; run nr contracts/),
    ])
  })

  it('fails naming each string or number field that has no bound', async () => {
    const unbounded: Contract = {
      ...contract,
      load: async () => ({
        Refusal: refusal,
        Event: z.object({
          note: z.string(),
          items: z.array(z.object({ count: z.number().min(0) })),
          either: z.union([z.string().max(8), z.number().max(3)]),
          kind: z.enum(['a', 'b']),
          ratio: z.number().min(0).max(1),
          code: z.string().length(43),
        }),
      }),
    }
    const root = freshRoot()
    await generate(root, [unbounded])
    expect(await checkContracts(root, [unbounded])).toEqual([
      'events: Event.note is an unbounded string; give it a maximum length in api/events.ts',
      'events: Event.items[].count is an unbounded number; give it a minimum and a maximum in api/events.ts',
      'events: Event.either is an unbounded number; give it a minimum and a maximum in api/events.ts',
    ])
  })

  it('C65: fails when the source changed without regeneration, or a copy is missing', async () => {
    const root = freshRoot()
    await generate(root, [contract])
    const changed: Contract = {
      ...contract,
      load: async () => ({ Event: z.object({ type: z.literal('other') }), Refusal: refusal }),
    }
    expect(await checkContracts(root, [changed])).toHaveLength(2)
    expect(await checkContracts(freshRoot(), [contract])).toEqual([
      expect.stringContaining('web/openapi.json is missing'),
      expect.stringContaining('plugin/generated.ts is missing'),
    ])
  })
})
