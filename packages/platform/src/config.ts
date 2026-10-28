// The configuration every process reads: the variable names of the platform's
// contract with an application (see vendors/infra), read the same way locally
// and in production, and validated at startup.

import { z } from 'zod'

const configSchema = z.object({
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

export type Config = z.infer<typeof configSchema>

function parsed<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.'))
    throw new Error(`Invalid configuration: ${[...new Set(keys)].join(', ')}`)
  }
  return result.data
}

export function readConfig(env: Record<string, string | undefined>): Config {
  return parsed(configSchema.safeParse(env))
}

// The keys a process needs, when it needs only some.
export function readConfigOf<K extends keyof Config>(
  env: Record<string, string | undefined>,
  keys: readonly K[],
): Pick<Config, K> {
  const mask: Partial<Record<keyof Config, true>> = Object.fromEntries(keys.map((key) => [key, true]))
  // The picked schema's type is the subset's, which TypeScript cannot follow from K.
  return parsed(configSchema.pick(mask).safeParse(env)) as unknown as Pick<Config, K>
}
