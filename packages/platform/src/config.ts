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
  POLLY_ENV: z.enum(['local', 'production']),
})

export type Config = z.infer<typeof configSchema>

export function readConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env)
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.'))
    throw new Error(`Invalid configuration: ${[...new Set(keys)].join(', ')}`)
  }
  return result.data
}
