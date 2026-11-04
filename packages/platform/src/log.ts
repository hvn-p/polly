// Logging (constitution XIX, research R22): a line is an event declared once,
// in the emitting module's events.ts, with its level; the caller names it and
// gives its fields. Each process has one logger: every file imports it from
// `@polly/platform/log`, which the build plugin tags with the file's tier,
// module and path, and it writes through the sink its composition root plugs
// in, the one port of the logging capacity.

export type LogFields = Readonly<Record<string, unknown>>

export interface LogEvent {
  readonly name: string
  readonly category: 'access' | 'functional' | 'technical' | 'security'
  readonly level: 'debug' | 'info' | 'warn' | 'error'
  // What to look at when the event appears.
  readonly investigate: string
}

// Where a line comes from, set by the build, never by the caller.
export interface LogSource {
  readonly tier: string
  readonly module: string
  readonly file: string
}

export interface LogRecord {
  event: LogEvent
  fields: LogFields
  source: LogSource
}

export interface LogSink {
  write: (record: LogRecord) => void
}

export type Log = (event: LogEvent, fields?: LogFields) => void

// Runs a request inside the trace its W3C traceparent names, or a new one: the
// logging capacity's, handed by a composition root to its entry.
export type WithTrace = <T>(incoming: string | null | undefined, run: () => T) => T

const NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/

export function defineEvent(name: string, spec: Omit<LogEvent, 'name'>): LogEvent {
  if (!NAME.test(name)) {
    throw new Error(`${name} is no event name: write <module>.<subject>.<outcome>, in snake case`)
  }
  return { name, ...spec }
}

let sink: LogSink | undefined

// Called by a composition root, once at start; a test plugs in a capture.
export function plugLogSink(next: LogSink): void {
  sink = next
}

export function logFrom(source: LogSource): Log {
  return (event, fields = {}) => sink?.write({ event, fields, source })
}
