// Writes each contract between two processes from its single Zod source
// (constitution principle VIII): an OpenAPI document and its TypeScript
// client. The compute service writes
// its OpenAPI itself, in Python. `nr contracts` regenerates them;
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
  // An API contract: its operations, its OpenAPI document and its client types.
  operations?: () => Promise<Record<string, Operation>>
  // Or the text of an OpenAPI document another language writes.
  document?: () => Promise<string>
  openapi?: string
  client?: string
}

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
    source: 'apps/api/src/contracts/api.ts',
    load: fromSource('apps/api/src/contracts/api.ts'),
    operations: operationsFromSource('apps/api/src/contracts/api.ts'),
    openapi: 'packages/contract/openapi.json',
    client: 'packages/contract/src/generated.ts',
  },
  {
    name: 'compute',
    source: 'services/compute/src/polly_compute/app.py',
    load: async () => ({}),
    document: async () => computeDocument(),
    openapi: 'services/compute/openapi.json',
    client: 'packages/analysis/src/generated.ts',
  },
]

const computeProject = join(repositoryRoot, 'services/compute')

// The compute service's environment is synced beforehand (dev:up, a CI step):
// writing its document downloads nothing.
function computeDocument(): string {
  return execFileSync(
    'uv',
    [
      'run',
      '--quiet',
      '--frozen',
      '--no-sync',
      '--project',
      computeProject,
      'python',
      '-m',
      'polly_compute.openapi',
    ],
    { encoding: 'utf8', cwd: computeProject },
  )
}

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
  if (typeof node['$ref'] === 'string') {
    return node['$ref'].split('/').at(-1) ?? 'unknown'
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
      if (node['properties'] === undefined) {
        return 'Record<string, unknown>'
      }
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

// The `type` of each event a stream's schema admits.
function eventTypes(schema: unknown): string[] {
  const node = (schema ?? {}) as Record<string, unknown>
  const members = (node['oneOf'] ?? node['anyOf'] ?? [node]) as Record<string, unknown>[]
  return members.flatMap((member) => {
    const type = (member['properties'] as Record<string, { const?: unknown }> | undefined)?.['type']?.const
    return typeof type === 'string' ? [type] : []
  })
}

// An operation of the OpenAPI document, as openApiDocument writes it.
interface DocumentOperation {
  operationId: string
  'x-refusals'?: string[]
  requestBody?: { content: Record<string, { schema: unknown }> }
  responses: Record<string, { content?: Record<string, { schema: unknown }> }>
}

// A response's JSON Schema on its own, for a client to validate an answer: the
// document's references point into $defs, which it carries when it uses them.
function standalone(schema: unknown, components: Record<string, unknown>): unknown {
  const local = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll('#/components/schemas/', '#/$defs/'))
  const text = JSON.stringify(schema)
  return text.includes('#/components/schemas/') ? { ...local(schema), $defs: local(components) } : schema
}

export function clientModule(source: string, document: Record<string, unknown>): string {
  const components = (document['components'] as { schemas: Record<string, unknown> }).schemas
  const lines = [
    `// Generated by nr contracts from ${source}: never edit it.`,
    '',
    "import type { JSONSchema } from 'zod/v4/core'",
    '',
  ]
  for (const [name, schema] of Object.entries(components)) {
    lines.push(`export type ${name} = ${typeOf(schema)}`, '')
  }
  const operations: string[] = []
  const table: string[] = []
  const streams: string[] = []
  const streamTable: string[] = []
  const responses: string[] = []
  const refusals = new Set<string>()
  for (const [path, methods] of Object.entries(
    document['paths'] as Record<string, Record<string, DocumentOperation>>,
  )) {
    for (const [method, operation] of Object.entries(methods)) {
      const id = operation.operationId
      const codes = operation['x-refusals'] ?? []
      for (const code of codes) {
        refusals.add(code)
      }
      const content = operation.responses['200']?.content ?? {}
      const answer = content['application/json']?.schema
      const entry = `{ method: '${method.toUpperCase()}', path: '${path}', refusals: [${codes.map((c) => `'${c}'`).join(', ')}] }`
      if ('text/event-stream' in content) {
        const event = content['text/event-stream']?.schema
        streams.push(`  ${id}: { event: ${typeOf(event)} }`)
        streamTable.push(
          `  ${id}: { path: '${path}', refusals: [${codes.map((c) => `'${c}'`).join(', ')}], events: [${eventTypes(
            event,
          )
            .map((t) => `'${t}'`)
            .join(', ')}] },`,
        )
        continue
      }
      const body = operation.requestBody?.content['application/json']?.schema
      operations.push(
        `  ${id}: { body: ${body === undefined ? 'undefined' : typeOf(body)}; response: ${answer === undefined ? 'undefined' : typeOf(answer)} }`,
      )
      table.push(`  ${id}: ${entry},`)
      if (answer !== undefined) {
        responses.push(`  ${id}: ${JSON.stringify(standalone(answer, components))},`)
      }
    }
  }
  lines.push('export interface Operations {', ...operations, '}', '')
  lines.push('export const OPERATIONS = {', ...table, '} as const', '')
  lines.push(
    '// The JSON Schema of each operation\'s response, which the client checks.',
    'export const RESPONSES: Partial<Record<keyof Operations, JSONSchema.JSONSchema>> = {',
    ...responses,
    '}',
    '',
  )
  if (streams.length > 0) {
    lines.push('export interface Streams {', ...streams, '}', '')
    lines.push('export const STREAMS = {', ...streamTable, '} as const', '')
  }
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

export async function render(contract: Contract): Promise<Map<string, string>> {
  const schemas = await contract.load()
  const files = new Map<string, string>()
  if (contract.operations !== undefined) {
    const api = openApiDocument(contract.name, schemas, await contract.operations())
    if (contract.openapi !== undefined) {
      files.set(contract.openapi, formatted(contract.openapi, JSON.stringify(api)))
    }
    if (contract.client !== undefined) {
      files.set(contract.client, formatted(contract.client, clientModule(contract.source, api)))
    }
  }
  if (contract.document !== undefined) {
    const text = await contract.document()
    if (contract.openapi !== undefined) {
      files.set(contract.openapi, formatted(contract.openapi, text))
    }
    if (contract.client !== undefined) {
      files.set(contract.client, formatted(contract.client, clientModule(contract.source, JSON.parse(text))))
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
