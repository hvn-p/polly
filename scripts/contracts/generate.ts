// Writes each contract between two processes from its single Zod source
// (constitution principle VIII): a JSON Schema document for every consumer,
// and Python types for the worker. `nr contracts` regenerates them;
// scripts/checks/contracts.mjs fails when a copy differs from its source.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type ZodType, z } from 'zod'

// One operation of the API: its route, its access rule, what it takes and gives
// (a JSON response, or a stream of events) and the refusals it may answer.
export interface Operation {
  method: 'GET' | 'POST'
  path: string
  access: 'public' | 'learner' | 'event-code'
  body?: ZodType
  response?: ZodType
  events?: ZodType
  refusals: readonly string[]
}

export interface Contract {
  name: string
  // Path of the Zod source, from the repository root.
  source: string
  load: () => Promise<Record<string, ZodType>>
  jsonSchema: string[]
  python?: string
  // An API contract: its operations, its OpenAPI document and its client types.
  operations?: () => Promise<Record<string, Operation>>
  openapi?: string
  client?: string
}

export type PythonRenderer = (jsonSchema: string) => Promise<string>

const repositoryRoot = join(import.meta.dirname, '..', '..')

async function sourceModule(source: string): Promise<Record<string, unknown>> {
  return (await import(pathToFileURL(join(repositoryRoot, source)).href)) as Record<string, unknown>
}

export function operationsFromSource(source: string): NonNullable<Contract['operations']> {
  return async () => (await sourceModule(source))['operations'] as Record<string, Operation>
}

export function fromSource(source: string): Contract['load'] {
  return async () => {
    const module = (await import(pathToFileURL(join(repositoryRoot, source)).href)) as {
      schemas: Record<string, ZodType>
    }
    return module.schemas
  }
}

export const CONTRACTS: Contract[] = [
  {
    name: 'api',
    source: 'apps/api/src/entry/contracts/api.ts',
    load: fromSource('apps/api/src/entry/contracts/api.ts'),
    operations: operationsFromSource('apps/api/src/entry/contracts/api.ts'),
    jsonSchema: [],
    openapi: 'packages/contract/openapi.json',
    client: 'packages/contract/src/generated.ts',
  },
  {
    // The monitor reads the stream's schemas until it is bundled with the client.
    name: 'agent-events',
    source: 'apps/api/src/entry/contracts/agent-events.ts',
    load: fromSource('apps/api/src/entry/contracts/agent-events.ts'),
    jsonSchema: ['plugin/contracts/agent-events.schema.json'],
  },
  {
    name: 'placeholder-analysis',
    source: 'apps/api/src/entry/contracts/placeholder-analysis.ts',
    load: fromSource('apps/api/src/entry/contracts/placeholder-analysis.ts'),
    jsonSchema: ['services/pron-worker/contracts/placeholder-analysis.schema.json'],
    python: 'services/pron-worker/src/pron_worker/contracts/placeholder_analysis.py',
  },
]

const workerProject = join(repositoryRoot, 'services/pron-worker')

export const renderPython: PythonRenderer = async (jsonSchema) =>
  execFileSync(
    'uv',
    [
      'run',
      '--quiet',
      // The worker's environment is synced beforehand (dev:up, a CI step):
      // rendering downloads nothing.
      '--frozen',
      '--no-sync',
      '--project',
      workerProject,
      'datamodel-codegen',
      '--input-file-type',
      'jsonschema',
      '--output-model-type',
      'typing.TypedDict',
      '--target-python-version',
      '3.14',
      '--use-standard-collections',
      '--use-union-operator',
      '--disable-timestamp',
      '--use-double-quotes',
      '--formatters',
      'ruff-format',
    ],
    { input: jsonSchema, encoding: 'utf8', cwd: workerProject },
  )

function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  const { $schema: _, ...definition } = z.toJSONSchema(schema)
  return definition
}

// In the repository's style, so a regeneration differs only where the source does.
function formatted(path: string, content: string): string {
  return execFileSync(
    join(repositoryRoot, 'node_modules', '.bin', 'biome'),
    ['format', `--stdin-file-path=${path}`],
    {
      input: content,
      encoding: 'utf8',
      cwd: repositoryRoot,
    },
  )
}

export function openApiDocument(
  name: string,
  schemas: Record<string, ZodType>,
  operations: Record<string, Operation>,
): Record<string, unknown> {
  const json = (schema: ZodType) => ({ 'application/json': { schema: jsonSchemaOf(schema) } })
  const paths: Record<string, Record<string, unknown>> = {}
  for (const [id, operation] of Object.entries(operations)) {
    const refusal = z.object({ code: z.enum(operation.refusals as [string, ...string[]]) })
    const ok =
      operation.events === undefined
        ? {
            description: 'done',
            ...(operation.response === undefined ? {} : { content: json(operation.response) }),
          }
        : {
            description: 'a stream of events',
            content: { 'text/event-stream': { schema: jsonSchemaOf(operation.events) } },
          }
    paths[operation.path] = {
      ...paths[operation.path],
      [operation.method.toLowerCase()]: {
        operationId: id,
        'x-access': operation.access,
        'x-refusals': [...operation.refusals],
        ...(operation.body === undefined
          ? {}
          : { requestBody: { required: true, content: json(operation.body) } }),
        responses: { '200': ok, default: { description: 'a refusal', content: json(refusal) } },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: name, version: '0' },
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(schemas).map(([key, schema]) => [key, jsonSchemaOf(schema)]),
      ),
    },
  }
}

// The TypeScript type a JSON Schema describes, for the shapes the contracts use.
export function typeOf(schema: unknown): string {
  if (typeof schema !== 'object' || schema === null) {
    return 'unknown'
  }
  const node = schema as Record<string, unknown>
  if ('const' in node) {
    return JSON.stringify(node['const'])
  }
  if (Array.isArray(node['enum'])) {
    return node['enum'].map((value) => JSON.stringify(value)).join(' | ')
  }
  for (const key of ['anyOf', 'oneOf']) {
    if (Array.isArray(node[key])) {
      return (node[key] as unknown[]).map(typeOf).join(' | ')
    }
  }
  switch (node['type']) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array':
      return `(${typeOf(node['items'])})[]`
    case 'object': {
      const required = new Set((node['required'] as string[] | undefined) ?? [])
      const fields = Object.entries((node['properties'] as Record<string, unknown> | undefined) ?? {}).map(
        ([key, child]) => `${key}${required.has(key) ? '' : '?'}: ${typeOf(child)}`,
      )
      return `{ ${fields.join('; ')} }`
    }
    default:
      return 'unknown'
  }
}

// An operation of the OpenAPI document, as openApiDocument writes it.
interface DocumentOperation {
  operationId: string
  'x-refusals': string[]
  requestBody?: { content: Record<string, { schema: unknown }> }
  responses: Record<string, { content?: Record<string, { schema: unknown }> }>
}

export function clientModule(source: string, document: Record<string, unknown>): string {
  const components = (document['components'] as { schemas: Record<string, unknown> }).schemas
  const lines = [`// Generated by nr contracts from ${source}: never edit it.`, '']
  for (const [name, schema] of Object.entries(components)) {
    lines.push(`export type ${name} = ${typeOf(schema)}`, '')
  }
  const operations: string[] = []
  const table: string[] = []
  const streams: string[] = []
  const streamTable: string[] = []
  const refusals = new Set<string>()
  for (const [path, methods] of Object.entries(
    document['paths'] as Record<string, Record<string, DocumentOperation>>,
  )) {
    for (const [method, operation] of Object.entries(methods)) {
      const id = operation.operationId
      const codes = operation['x-refusals']
      for (const code of codes) {
        refusals.add(code)
      }
      const content = operation.responses['200']?.content ?? {}
      const entry = `{ method: '${method.toUpperCase()}', path: '${path}', refusals: [${codes.map((c) => `'${c}'`).join(', ')}] }`
      if ('text/event-stream' in content) {
        streams.push(`  ${id}: { event: ${typeOf(content['text/event-stream']?.schema)} }`)
        streamTable.push(
          `  ${id}: { path: '${path}', refusals: [${codes.map((c) => `'${c}'`).join(', ')}] },`,
        )
        continue
      }
      const body = operation.requestBody?.content['application/json']?.schema
      const response = content['application/json']?.schema
      operations.push(
        `  ${id}: { body: ${body === undefined ? 'undefined' : typeOf(body)}; response: ${response === undefined ? 'undefined' : typeOf(response)} }`,
      )
      table.push(`  ${id}: ${entry},`)
    }
  }
  lines.push('export interface Operations {', ...operations, '}', '')
  lines.push('export const OPERATIONS = {', ...table, '} as const', '')
  lines.push('export interface Streams {', ...streams, '}', '')
  lines.push('export const STREAMS = {', ...streamTable, '} as const', '')
  lines.push(
    `export const REFUSAL_CODES = [${[...refusals]
      .sort()
      .map((c) => `'${c}'`)
      .join(', ')}] as const`,
    '',
  )
  lines.push('export type RefusalCode = (typeof REFUSAL_CODES)[number]', '')
  return lines.join('\n')
}

export async function render(
  contract: Contract,
  python: PythonRenderer = renderPython,
): Promise<Map<string, string>> {
  const schemas = await contract.load()
  const definitions = Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => {
      const { $schema: _, ...definition } = z.toJSONSchema(schema)
      return [name, definition]
    }),
  )
  const document = `${JSON.stringify(
    { $schema: 'https://json-schema.org/draft/2020-12/schema', title: contract.name, $defs: definitions },
    null,
    2,
  )}\n`
  const files = new Map(contract.jsonSchema.map((path) => [path, document]))
  if (contract.python !== undefined) {
    files.set(contract.python, await python(document))
  }
  if (contract.operations !== undefined) {
    const api = openApiDocument(contract.name, schemas, await contract.operations())
    if (contract.openapi !== undefined) {
      files.set(contract.openapi, formatted(contract.openapi, JSON.stringify(api)))
    }
    if (contract.client !== undefined) {
      files.set(contract.client, formatted(contract.client, clientModule(contract.source, api)))
    }
  }
  return files
}

export async function generate(root: string, contracts: Contract[] = CONTRACTS): Promise<void> {
  for (const contract of contracts) {
    for (const [path, content] of await render(contract)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), content)
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  await generate(repositoryRoot)
}
