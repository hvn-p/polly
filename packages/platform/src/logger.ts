// Logging, as a port: every process writes through it, and its implementation
// keeps secrets out of what it writes. A line holds identifiers, never content.
export type LogFields = Readonly<Record<string, unknown>>

export interface Logger {
  debug: (message: string, fields?: LogFields) => void
  info: (message: string, fields?: LogFields) => void
  warn: (message: string, fields?: LogFields) => void
  error: (message: string, fields?: LogFields) => void
  // A logger whose lines all carry these fields, such as the module writing them.
  child: (fields: LogFields) => Logger
}
