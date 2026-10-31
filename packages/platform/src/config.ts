// The configuration every process reads, validated at startup, the same way
// locally and in production: the variable names of the platform's contract with
// an application (see vendors/infra), and each process's own settings. The one
// place that reads the process environment.

import { z } from 'zod'
import { Refusal } from './refusal.ts'

const contractSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PUBLIC_URL: z.url({ protocol: /^https?$/ }),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  S3_REGION: z.string().min(1).max(64),
  S3_BUCKET: z.string().min(3).max(63),
  S3_ACCESS_KEY_ID: z.string().min(1).max(128),
  S3_SECRET_ACCESS_KEY: z.string().min(1).max(256),
  BETTER_AUTH_SECRET: z.string().min(32).max(256),
  // The MCP server's secret as the identity's confidential client.
  MCP_CLIENT_SECRET: z.string().min(32).max(256),
  POLLY_ENV: z.enum(['local', 'production']),
})

const address = z.union([z.ipv4(), z.ipv6()])
const port = z.coerce.number().int().min(1).max(65_535)

const configSchema = contractSchema.extend({
  // Where the API and the MCP server listen: an IP address, never a host name.
  POLLY_API_HOST: address,
  POLLY_API_PORT: port,
  POLLY_MCP_HOST: address,
  POLLY_MCP_PORT: port,
  // The worker's analyzer; the fake one is for a local worktree only.
  POLLY_WORKER_MODE: z.enum(['fake', 'real']).optional(),
  POLLY_COMPUTE_URL: z.url({ protocol: /^https?$/ }).optional(),
  // The fingerprint of the worktree's services/compute, to compare with the
  // service's.
  POLLY_COMPUTE_FINGERPRINT: z.string().min(1).max(128).optional(),
})

// The platform's contract, which the API reads whole.
export type Config = z.infer<typeof contractSchema>

export type Settings = z.infer<typeof configSchema>

function parsed<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.'))
    throw new Refusal('INVALID_CONFIGURATION', `${[...new Set(keys)].join(', ')} invalid or missing`)
  }
  return result.data
}

// The environment of the running process, which only the composition roots
// read, to hand it to readConfig or readConfigOf.
export function environment(): Record<string, string | undefined> {
  return process.env
}

export function readConfig(env: Record<string, string | undefined>): Config {
  return parsed(contractSchema.safeParse(env))
}

// The keys a process needs, when it needs only some.
export function readConfigOf<K extends keyof Settings>(
  env: Record<string, string | undefined>,
  keys: readonly K[],
): Pick<Settings, K> {
  const mask: Partial<Record<keyof Settings, true>> = Object.fromEntries(keys.map((key) => [key, true]))
  // The picked schema's type is the subset's, which TypeScript cannot follow from K.
  return parsed(configSchema.pick(mask).safeParse(env)) as unknown as Pick<Settings, K>
}
