import { createLogSink } from '@polly/logging'
import { plugLogSink } from '@polly/platform'

export type LogRecord = Record<string, unknown> & { level: string; event: string }

// Plugs a sink whose lines are kept, as written and parsed, into this test
// file's logger.
export function captureLog(): { lines: string[]; records: () => LogRecord[] } {
  const lines: string[] = []
  plugLogSink(createLogSink({ name: 'polly-api', write: (line) => lines.push(line) }))
  return { lines, records: () => lines.map((line) => JSON.parse(line) as LogRecord) }
}
