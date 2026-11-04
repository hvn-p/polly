// The socle: what every Polly process shares, with no product word and no
// chosen technology.

export { type Clock, systemClock } from './clock.ts'
export { type Config, environment, readConfig, readConfigOf, type Settings } from './config.ts'
export {
  defineEvent,
  type Log,
  type LogEvent,
  type LogFields,
  type LogRecord,
  type LogSink,
  type LogSource,
  logFrom,
  plugLogSink,
  type WithTrace,
} from './log.ts'
export { originOf } from './origin.ts'
export { Refusal } from './refusal.ts'
export { type Guard, type Guards, type Method, type Route, RouteRegistry } from './routes.ts'
