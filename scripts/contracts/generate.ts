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
// (a JSON response, or a stream of events) with its success status, and the
// refusals it may answer. A stream may end with a refusal, sent as its error
// event, whose data is the contract's Refusal.
export interface Operation {
  method: 'GET' | 'POST'
  path: string
  access: 'public' | 'learner' | 'event-code'
  status: number
  body?: ZodType
  response?: ZodType
  events?: ZodType
  error?: { event: string; refusals: readonly string[] }
  refusals: readonly string[]
}

// The HTTP status of each refusal code, of a path no route serves, and of an
// unexpected failure.
export interface Statuses {
  refusals: Record<string, number>
  unrouted: number
  unexpected: number
}

export interface Contract {
  name: string
  // Path of the Zod source, from the repository root.
  source: string
  load: () => Promise<Record<string, ZodType>>
  // An API contract: its operations, its statuses, its OpenAPI document and its
  // client types.
  operations?: () => Promise<Record<string, Operation>>
  statuses?: () => Promise<Statuses>
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

export function statusesFromSource(source: string): NonNullable<Contract['statuses']> {
  return async () => (await sourceModule(source))['statuses'] as Statuses
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
    statuses: statusesFromSource('apps/api/src/contracts/api.ts'),
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
  statuses: Statuses,
): Record<string, unknown> {
  const json = (schema: ZodType) => ({ 'application/json': { schema: jsonSchemaOf(schema) } })
  // Every refusal is the contract's Refusal, its code narrowed to the operation's.
  const listed = schemas['Refusal']
  if (!(listed instanceof z.ZodObject) || !(listed.shape['code'] instanceof z.ZodEnum)) {
    throw new Error(`${name}: an API contract defines its Refusal schema, an object whose code is an enum`)
  }
  const codes: readonly unknown[] = listed.shape['code'].options
  for (const code of codes) {
    if (!Object.hasOwn(statuses.refusals, String(code))) {
      throw new Error(`${name}: ${String(code)} has no HTTP status`)
    }
  }
  for (const code of Object.keys(statuses.refusals)) {
    if (!codes.includes(code)) {
      throw new Error(`${name}: ${code} has an HTTP status, but the Refusal schema does not list it`)
    }
  }
  const paths: Record<string, Record<string, unknown>> = {}
  for (const [id, operation] of Object.entries(operations)) {
    for (const code of [...operation.refusals, ...(operation.error?.refusals ?? [])]) {
      if (!codes.includes(code)) {
        throw new Error(`${name}: ${id} refuses with ${code}, which the Refusal schema does not list`)
      }
    }
    // One response per refusal status, its code narrowed to the operation's
    // refusals answered with that status.
    const refused: Record<string, unknown> = {}
    for (const status of new Set(operation.refusals.map((code) => statuses.refusals[code]))) {
      const answered = operation.refusals.filter((code) => statuses.refusals[code] === status)
      refused[String(status)] = {
        description: 'a refusal',
        content: json(listed.extend({ code: z.enum(answered as [string, ...string[]]) })),
      }
    }
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
        ...(operation.error === undefined
          ? {}
          : { 'x-error-event': { event: operation.error.event, refusals: [...operation.error.refusals] } }),
        ...(operation.body === undefined
          ? {}
          : { requestBody: { required: true, content: json(operation.body) } }),
        responses: { [String(operation.status)]: ok, ...refused },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: { title: name, version: '0' },
    'x-refusal-status': statuses.refusals,
    'x-unrouted-status': statuses.unrouted,
    'x-unexpected-status': statuses.unexpected,
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

function quoted(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ')
}

// An operation of the OpenAPI document, as openApiDocument writes it.
interface DocumentOperation {
  operationId: string
  'x-refusals'?: string[]
  'x-error-event'?: { event: string; refusals: string[] }
  requestBody?: { content: Record<string, { schema: unknown }> }
  responses: Record<string, { content?: Record<string, { schema: unknown }> }>
}

// A response's JSON Schema on its own, for a client to validate an answer: the
// document's references point into $defs, which it carries when it uses them.
function standalone(schema: unknown, components: Record<string, unknown>): unknown {
  const local = (value: unknown) =>
    JSON.parse(JSON.stringify(value).replaceAll('#/components/schemas/', '#/$defs/'))
  const text = JSON.stringify(schema)
  return text.includes('#/components/schemas/') ? { ...local(schema), $defs: local(components) } : schema
}

// The bounds of each schema's string and number fields, as `{ min, max }`.
function boundsOf(components: Record<string, unknown>): string[] {
  const lines: string[] = []
  for (const [name, schema] of Object.entries(components)) {
    const properties = (schema as { properties?: Record<string, Record<string, unknown>> }).properties ?? {}
    const fields: string[] = []
    for (const [field, property] of Object.entries(properties)) {
      const min = property['minLength'] ?? property['minimum']
      const max = property['maxLength'] ?? property['maximum']
      const bounds = [
        ...(typeof min === 'number' ? [`min: ${min}`] : []),
        ...(typeof max === 'number' ? [`max: ${max}`] : []),
      ]
      if (bounds.length > 0) {
        fields.push(`${field}: { ${bounds.join(', ')} }`)
      }
    }
    if (fields.length > 0) {
      lines.push(`  ${name}: { ${fields.join(', ')} },`)
    }
  }
  return lines
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
  const refusal = components['Refusal'] as { properties?: { code?: { enum?: string[] } } } | undefined
  const refusals = refusal?.properties?.code?.enum ?? []
  for (const [path, methods] of Object.entries(
    document['paths'] as Record<string, Record<string, DocumentOperation>>,
  )) {
    for (const [method, operation] of Object.entries(methods)) {
      const id = operation.operationId
      const codes = quoted(operation['x-refusals'] ?? [])
      // The success: the one 2xx response.
      const [status, success] = Object.entries(operation.responses).find(([key]) => key.startsWith('2')) ?? [
        '200',
        undefined,
      ]
      const content = success?.content ?? {}
      const answer = content['application/json']?.schema
      const entry = `{ method: '${method.toUpperCase()}', path: '${path}', status: ${status}, refusals: [${codes}] }`
      if ('text/event-stream' in content) {
        const event = content['text/event-stream']?.schema
        const error = operation['x-error-event']
        streams.push(`  ${id}: { event: ${typeOf(event)} }`)
        streamTable.push(
          `  ${id}: { path: '${path}', status: ${status}, refusals: [${codes}], events: [${quoted(eventTypes(event))}]${
            error === undefined
              ? ''
              : `, error: { event: '${error.event}', refusals: [${quoted(error.refusals)}] }`
          } },`,
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
    "// The JSON Schema of each operation's response, which the client checks.",
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
  const refusalStatus = document['x-refusal-status'] as Record<string, number> | undefined
  if (refusalStatus !== undefined) {
    lines.push(
      '// The HTTP status each refusal code is answered with.',
      'export const REFUSAL_STATUS = {',
      ...Object.entries(refusalStatus).map(([code, status]) => `  ${code}: ${status},`),
      '} as const',
      '',
      '// The status of a path no route serves: no refusal of the contract, no body.',
      `export const UNROUTED_STATUS = ${String(document['x-unrouted-status'])}`,
      '',
      '// The status of an unexpected failure: no refusal of the contract, no body.',
      `export const UNEXPECTED_STATUS = ${String(document['x-unexpected-status'])}`,
      '',
    )
  }
  const bounds = boundsOf(components)
  if (bounds.length > 0) {
    lines.push(
      "// The bounds of each schema's fields, which the API checks: a form checks them first.",
      'export const BOUNDS = {',
      ...bounds,
      '} as const',
      '',
    )
  }
  return lines.join('\n')
}

export async function render(contract: Contract): Promise<Map<string, string>> {
  const schemas = await contract.load()
  const files = new Map<string, string>()
  if (contract.operations !== undefined) {
    if (contract.statuses === undefined) {
      throw new Error(`${contract.name}: an API contract states its statuses`)
    }
    const api = openApiDocument(
      contract.name,
      schemas,
      await contract.operations(),
      await contract.statuses(),
    )
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
