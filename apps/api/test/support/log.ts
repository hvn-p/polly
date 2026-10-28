import { createLogger } from '@polly/logging'
import type { Logger } from '@polly/platform'

export type LogRecord = Record<string, unknown> & { level: string; message: string }

// A logger whose lines are kept, as written and parsed.
export function captureLog(): { log: Logger; lines: string[]; records: () => LogRecord[] } {
  const lines: string[] = []
  const log = createLogger({ name: 'polly-api', write: (line) => lines.push(line) })
  return { log, lines, records: () => lines.map((line) => JSON.parse(line) as LogRecord) }
}
