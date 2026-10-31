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
const statuses = async () => ({
  refusals: {
    UNAUTHORIZED: 401,
    INVALID_EVENT_CODE: 400,
    EVENT_CODE_REVOKED: 403,
    EVENT_CODE_NOT_BOUND: 409,
  },
  unrouted: 404,
})
const contract: Contract = {
  name: 'events',
  source: 'api/events.ts',
  load: async () => ({ Event: event, Refusal: refusal }),
  operations: async () => ({
    getEvent: {
      method: 'GET',
      path: '/events',
      access: 'public',
      status: 200,
      response: event,
      refusals: [],
    },
  }),
  statuses,
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
    expect(client).toContain("analyze: { method: 'POST', path: '/analyses', status: 200, refusals: [] }")
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
      status: 200,
      response: learner,
      refusals: ['UNAUTHORIZED'],
    },
    bindEventCode: {
      method: 'POST',
      path: '/api/event-codes',
      access: 'learner',
      status: 201,
      body: code,
      response: z.object({ bound: z.literal(true) }),
      refusals: ['UNAUTHORIZED', 'INVALID_EVENT_CODE'],
    },
    agentEvents: {
      method: 'GET',
      path: '/api/agent-events',
      access: 'event-code',
      status: 200,
      events: agentEvent,
      error: { event: 'error', refusals: ['EVENT_CODE_NOT_BOUND'] },
      refusals: ['EVENT_CODE_REVOKED'],
    },
  }),
  statuses,
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
    expect(Object.keys(bind.responses)).toEqual(['201', '400', '401'])
    const refused = bind.responses['401'].content['application/json'].schema
    expect(refused.properties.code.enum).toEqual(['UNAUTHORIZED'])
    expect(refused.properties.reason).toMatchObject({ type: 'string', maxLength: 512 })
    expect(refused.required).toEqual(['code'])
    expect(bind.responses['400'].content['application/json'].schema.properties.code.enum).toEqual([
      'INVALID_EVENT_CODE',
    ])
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
    expect(client.replace(/\s+/g, ' ')).toContain("agentEvents: { path: '/api/agent-events'")
    expect(client.replace(/\s+/g, ' ')).toContain(
      "export const REFUSAL_CODES = [ 'EVENT_CODE_NOT_BOUND', 'EVENT_CODE_REVOKED', 'INVALID_EVENT_CODE', 'UNAUTHORIZED', ] as const",
    )
  })

  it("refuses an operation's refusal that the Refusal schema does not list, or a contract without one", async () => {
    const stray: Contract = {
      ...api,
      operations: async () => ({
        getMe: {
          method: 'GET',
          path: '/api/me',
          access: 'learner',
          status: 200,
          response: learner,
          refusals: ['GONE'],
        },
      }),
    }
    await expect(render(stray)).rejects.toThrow(
      'api: getMe refuses with GONE, which the Refusal schema does not list',
    )
    const bare: Contract = { ...api, load: async () => ({ Learner: learner }) }
    await expect(render(bare)).rejects.toThrow('api: an API contract defines its Refusal schema')
  })

  it("writes the bounds of each schema's fields, for a form that checks them before the API does", async () => {
    const client = (await render(api)).get('contract/src/generated.ts') ?? ''
    expect(client.replace(/\s+/g, ' ')).toContain(
      'export const BOUNDS = { Learner: { learnerId: { max: 64 } }, Code: { code: { min: 43, max: 43 } }, Refusal: { reason: { max: 512 } }, } as const',
    )
  })

  it("lists each stream's event types and refusals, for a client that checks them at runtime", async () => {
    const client = (await render(api)).get('contract/src/generated.ts') ?? ''
    expect(client.replace(/\s+/g, ' ')).toContain(
      "agentEvents: { path: '/api/agent-events', status: 200, refusals: ['EVENT_CODE_REVOKED'], events: ['test'], error: { event: 'error', refusals: ['EVENT_CODE_NOT_BOUND'] }, }",
    )
  })

  it("declares the event that ends a stream with a refusal, its data the contract's Refusal", async () => {
    const document = JSON.parse((await render(api)).get('contract/openapi.json') ?? '')
    const stream = document.paths['/api/agent-events'].get
    expect(stream['x-error-event']).toEqual({ event: 'error', refusals: ['EVENT_CODE_NOT_BOUND'] })
    expect(stream['x-refusals']).toEqual(['EVENT_CODE_REVOKED'])
  })

  it("writes each operation's success status, and each refusal code's status, into the document and the client", async () => {
    const files = await render(api)
    const document = JSON.parse(files.get('contract/openapi.json') ?? '')
    expect(document['x-refusal-status']).toEqual({
      UNAUTHORIZED: 401,
      INVALID_EVENT_CODE: 400,
      EVENT_CODE_REVOKED: 403,
      EVENT_CODE_NOT_BOUND: 409,
    })
    expect(document['x-unrouted-status']).toBe(404)
    expect(document.paths['/api/me'].get.responses['200'].description).toBe('done')
    const client = (files.get('contract/src/generated.ts') ?? '').replace(/\s+/g, ' ')
    expect(client).toContain("bindEventCode: { method: 'POST', path: '/api/event-codes', status: 201,")
    expect(client).toContain(
      'export const REFUSAL_STATUS = { UNAUTHORIZED: 401, INVALID_EVENT_CODE: 400, EVENT_CODE_REVOKED: 403, EVENT_CODE_NOT_BOUND: 409, } as const',
    )
    expect(client).toContain('export const UNROUTED_STATUS = 404')
  })

  it('refuses a refusal code without a status, or a status for a code the Refusal schema does not list', async () => {
    const missing: Contract = {
      ...api,
      statuses: async () => ({ refusals: { UNAUTHORIZED: 401 }, unrouted: 404 }),
    }
    await expect(render(missing)).rejects.toThrow('api: INVALID_EVENT_CODE has no HTTP status')
    const stray: Contract = {
      ...api,
      statuses: async () => ({
        refusals: {
          UNAUTHORIZED: 401,
          INVALID_EVENT_CODE: 400,
          EVENT_CODE_REVOKED: 403,
          EVENT_CODE_NOT_BOUND: 409,
          GONE: 410,
        },
        unrouted: 404,
      }),
    }
    await expect(render(stray)).rejects.toThrow(
      'api: GONE has an HTTP status, but the Refusal schema does not list it',
    )
  })

  it("refuses a stream's error refusal that the Refusal schema does not list", async () => {
    const stray: Contract = {
      ...api,
      operations: async () => ({
        agentEvents: {
          method: 'GET',
          path: '/api/agent-events',
          access: 'event-code',
          status: 200,
          events: agentEvent,
          error: { event: 'error', refusals: ['GONE'] },
          refusals: [],
        },
      }),
    }
    await expect(render(stray)).rejects.toThrow(
      'api: agentEvents refuses with GONE, which the Refusal schema does not list',
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
