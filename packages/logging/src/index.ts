// The logging capacity (research R17, R22): the socle logger's sink, written
// with Pino as JSON lines on stderr, and the trace each line carries. Before a
// line is written, a field named like an authorization header or a cookie is
// removed, and an event code or a JWT is replaced wherever it appears, so a
// line holds identifiers only (constitution XVII).

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { type LogFields, type LogSink, plugLogSink, Refusal } from '@polly/platform'
import { log } from '@polly/platform/log'
import { pino, stdTimeFunctions } from 'pino'
import { PROCESS_FAILED, PROCESS_REFUSED, PROCESS_STARTED } from './events.ts'

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
    return { name: value.name, message: scrub(value.message), stack: scrub(value.stack ?? '') }
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

// The trace a line belongs to: taken from the request's W3C traceparent, or
// started at the entry.
const traces = new AsyncLocalStorage<{ traceId: string }>()
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/

export function withTrace<T>(incoming: string | null | undefined, run: () => T): T {
  const traceId = TRACEPARENT.exec(incoming ?? '')?.[1]
  const valid = traceId !== undefined && !/^0+$/.test(traceId)
  return traces.run({ traceId: valid ? traceId : randomBytes(16).toString('hex') }, run)
}

// The traceparent a call made inside a trace sends downstream.
export function traceparent(): string | undefined {
  const trace = traces.getStore()
  return trace === undefined ? undefined : `00-${trace.traceId}-${randomBytes(8).toString('hex')}-01`
}

export function createLogSink({
  name,
  write = (line) => process.stderr.write(line),
}: {
  name: string
  write?: (line: string) => void
}): LogSink {
  const logger = pino(
    {
      level: 'info',
      // The process's name, without Pino's pid and hostname.
      base: { process: name },
      timestamp: stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        log: (fields) => clean(fields) as Record<string, unknown>,
      },
    },
    { write },
  )
  return {
    write: ({ event, fields, source }) => {
      const trace = traces.getStore()
      logger[event.level]({
        event: event.name,
        category: event.category,
        ...source,
        ...(trace === undefined ? {} : { trace_id: trace.traceId }),
        ...fields,
      })
    },
  }
}

// A process's run: plugs its sink in, starts it, and logs the start, or the
// failure, after which it exits 1.
export async function runProcess({
  name,
  start,
  write,
  exit = (code) => process.exit(code),
}: {
  name: string
  // Starts the process; resolves with what its start line reports.
  start: () => Promise<LogFields>
  write?: (line: string) => void
  exit?: (code: number) => void
}): Promise<void> {
  plugLogSink(createLogSink({ name, ...(write === undefined ? {} : { write }) }))
  try {
    log(PROCESS_STARTED, await start())
  } catch (error) {
    if (error instanceof Refusal) {
      log(PROCESS_REFUSED, { code: error.code, reason: error.message })
    } else {
      log(PROCESS_FAILED, { error })
    }
    exit(1)
  }
}
