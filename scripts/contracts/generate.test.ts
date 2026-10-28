import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { checkContracts } from '../checks/contracts.mjs'
import { CONTRACTS, type Contract, generate, render } from './generate.ts'

const repositoryRoot = join(import.meta.dirname, '..', '..')

const event = { Event: z.object({ type: z.literal('test') }) }
const contract: Contract = {
  name: 'events',
  source: 'api/events.ts',
  load: async () => event,
  jsonSchema: ['plugin/events.schema.json', 'web/events.schema.json'],
}

function freshRoot(): string {
  return mkdtempSync(join(tmpdir(), 'contracts-'))
}

describe('contract generation', () => {
  it('writes one JSON Schema document per contract, a definition per schema', async () => {
    const files = await render(contract)
    const document = JSON.parse(files.get('plugin/events.schema.json') ?? '')
    expect(document.title).toBe('events')
    expect(document.$defs.Event).toEqual({
      type: 'object',
      properties: { type: { type: 'string', const: 'test' } },
      required: ['type'],
      additionalProperties: false,
    })
    expect(files.get('web/events.schema.json')).toBe(files.get('plugin/events.schema.json'))
  })

  it('writes Python types through the Python renderer, from the same document', async () => {
    const seen: string[] = []
    const python: Contract = { ...contract, jsonSchema: ['a.json'], python: 'worker/events.py' }
    const files = await render(python, async (schema) => {
      seen.push(schema)
      return '# generated\n'
    })
    expect(seen).toEqual([files.get('a.json')])
    expect(files.get('worker/events.py')).toBe('# generated\n')
  })

  it('accepts the repository as it is', async () => {
    expect(await checkContracts(repositoryRoot, CONTRACTS)).toEqual([])
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
    const path = join(root, 'web/events.schema.json')
    writeFileSync(path, readFileSync(path, 'utf8').replace('"test"', '"edited"'))
    expect(await checkContracts(root, [contract])).toEqual([
      expect.stringMatching(
        /^events: web\/events\.schema\.json differs from api\/events\.ts; run nr contracts/,
      ),
    ])
  })

  it('fails naming each string or number field that has no bound', async () => {
    const unbounded: Contract = {
      ...contract,
      load: async () => ({
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
      load: async () => ({ Event: z.object({ type: z.literal('other') }) }),
    }
    expect(await checkContracts(root, [changed])).toHaveLength(2)
    expect(await checkContracts(freshRoot(), [contract])).toEqual([
      expect.stringContaining('plugin/events.schema.json is missing'),
      expect.stringContaining('web/events.schema.json is missing'),
    ])
  })
})
