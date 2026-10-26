// Completion of a worktree's .env.local from dev/env.template: the keys
// missing from the file are generated and appended; the existing content is
// kept byte for byte, so a generated value is never rewritten.

import { deriveIdentity, type ResourceNames, resourceNames } from '../identity/index.ts'

export interface Generators {
  branch: string
  freePort: () => Promise<number>
  random: (bytes: number) => Buffer
}

const LINE = /^([A-Z][A-Z0-9_]*)=(.*)$/

export function parseEnv(content: string): Map<string, string> {
  const env = new Map<string, string>()
  for (const line of content.split('\n')) {
    const match = LINE.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) {
      env.set(match[1], match[2])
    }
  }
  return env
}

const NAME_GENERATORS: Record<string, keyof ResourceNames> = {
  database: 'database',
  'test-database': 'testDatabase',
  role: 'role',
  bucket: 'bucket',
  host: 'host',
}

async function generate(
  name: string,
  argument: string | undefined,
  env: Map<string, string>,
  generators: Generators,
) {
  if (name === 'identity') {
    return deriveIdentity(generators.branch)
  }
  const resource = NAME_GENERATORS[name]
  if (resource !== undefined) {
    const identity = env.get('POLLY_WORKTREE_ID')
    if (identity === undefined) {
      throw new Error(`env.template: {{${name}}} needs POLLY_WORKTREE_ID above it`)
    }
    return resourceNames(identity)[resource]
  }
  if (name === 'free-port') {
    return String(await generators.freePort())
  }
  if ((name === 'base64url' || name === 'hex') && argument !== undefined) {
    return generators.random(Number(argument)).toString(name)
  }
  throw new Error(`env.template: unknown generator {{${name}}}`)
}

async function expand(value: string, env: Map<string, string>, generators: Generators): Promise<string> {
  let result = value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => {
    const referenced = env.get(key)
    if (referenced === undefined) {
      throw new Error(`env.template: \${${key}} is not a key above it`)
    }
    return referenced
  })
  for (const match of result.matchAll(/\{\{([a-z0-9-]+)(?::(\d+))?\}\}/g)) {
    result = result.replace(match[0], await generate(match[1] ?? '', match[2], env, generators))
  }
  return result
}

export async function completeEnv(
  template: string,
  existing: string,
  generators: Generators,
): Promise<string> {
  const env = parseEnv(existing)
  const added: string[] = []
  for (const [key, value] of parseEnv(template)) {
    if (!env.has(key)) {
      const generated = await expand(value, env, generators)
      env.set(key, generated)
      added.push(`${key}=${generated}`)
    }
  }
  if (added.length === 0) {
    return existing
  }
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n'
  return `${existing}${separator}${added.join('\n')}\n`
}
