// Writes each contract between two processes from its single Zod source
// (constitution principle VIII): a JSON Schema document for every consumer,
// and Python types for the worker. `nr contracts` regenerates them;
// scripts/checks/contracts.mjs fails when a copy differs from its source.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type ZodType, z } from 'zod'

export interface Contract {
  name: string
  // Path of the Zod source, from the repository root.
  source: string
  load: () => Promise<Record<string, ZodType>>
  jsonSchema: string[]
  python?: string
}

export type PythonRenderer = (jsonSchema: string) => Promise<string>

const repositoryRoot = join(import.meta.dirname, '..', '..')

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
