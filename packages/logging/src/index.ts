// The logging capacity (research R17): Pino behind the socle's Logger port. Each
// process creates its logger at its composition root and writes JSON lines on
// stderr. Before a line is written, a field named like an authorization header
// or a cookie is removed, and an event code or a JWT is replaced wherever it
// appears, so a line holds identifiers only (constitution XVII).

import type { LogFields, Logger } from '@polly/platform'
import { pino, stdTimeFunctions } from 'pino'

const SECRET_FIELD = /authorization|cookie/i
const REDACTED = '[REDACTED]'
// 32 random bytes in base64url, standing alone; and a JWT's three parts.
const SECRETS = [
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
  /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
]

function scrub(text: string): string {
  return SECRETS.reduce((clean, pattern) => clean.replace(pattern, REDACTED), text)
}

function clean(value: unknown): unknown {
  if (typeof value === 'string') {
    return scrub(value)
  }
  if (value instanceof Error) {
    return { name: value.name, message: scrub(value.message) }
  }
  if (Array.isArray(value)) {
    return value.map(clean)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_FIELD.test(key))
        .map(([key, field]) => [key, clean(field)]),
    )
  }
  return value
}

function port(logger: pino.Logger): Logger {
  const at =
    (level: 'debug' | 'info' | 'warn' | 'error') =>
    (message: string, fields: LogFields = {}): void => {
      logger[level](fields, scrub(message))
    }
  return {
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    child: (fields) => port(logger.child(clean(fields) as LogFields)),
  }
}

export function createLogger({
  name,
  write = (line) => process.stderr.write(line),
}: {
  name: string
  write?: (line: string) => void
}): Logger {
  return port(
    pino(
      {
        level: 'info',
        messageKey: 'message',
        // The process's name, without Pino's pid and hostname.
        base: { name },
        timestamp: stdTimeFunctions.isoTime,
        formatters: {
          level: (label) => ({ level: label }),
          log: (fields) => clean(fields) as Record<string, unknown>,
        },
      },
      { write },
    ),
  )
}
