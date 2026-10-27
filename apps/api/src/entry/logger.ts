// The API's logger (research R17): JSON lines, identifiers only. Configured
// once per process, by main.ts or cli.ts; the request log writes through it.
// Before a line is written, fields named like an authorization header or a
// cookie are removed, and an event code or a JWT is replaced wherever it
// appears.

import { configure, getJsonLinesFormatter, getLogger, type Logger, reset, type Sink } from '@logtape/logtape'
import { JWT_PATTERN, redactByField, redactByPattern } from '@logtape/redaction'

const ROOT = 'polly'

// 32 random bytes, base64url, standing alone.
const EVENT_CODE_PATTERN = {
  pattern: /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
  replacement: '[REDACTED]',
}

const SECRET_FIELDS = [/authorization/i, /cookie/i]

export async function configureLogging(
  write: (line: string) => void = (line) => process.stderr.write(line),
): Promise<void> {
  const format = redactByPattern(getJsonLinesFormatter(), [JWT_PATTERN, EVENT_CODE_PATTERN])
  const sink: Sink = (record) => write(format(record))
  await configure({
    reset: true,
    sinks: { stderr: redactByField(sink, { fieldPatterns: SECRET_FIELDS }) },
    loggers: [
      { category: [ROOT], sinks: ['stderr'], lowestLevel: 'info' },
      { category: ['logtape', 'meta'], sinks: ['stderr'], lowestLevel: 'warning' },
    ],
  })
}

export const resetLogging = reset

export function logger(...category: string[]): Logger {
  return getLogger([ROOT, ...category])
}
