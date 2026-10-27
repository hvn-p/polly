import { configureLogging } from '../../src/entry/logger.ts'

export interface LogRecord {
  level: string
  logger: string
  message: string
  properties: Record<string, unknown>
}

// The lines the API's logger writes from now on, as written and parsed.
export async function captureLog(): Promise<{ lines: string[]; records: () => LogRecord[] }> {
  const lines: string[] = []
  await configureLogging((line) => lines.push(line))
  return { lines, records: () => lines.map((line) => JSON.parse(line) as LogRecord) }
}
