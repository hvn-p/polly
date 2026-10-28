// The socle: what every Polly process shares, with no product word and no
// chosen technology.

export { type Clock, systemClock } from './clock.ts'
export { type Config, readConfig, readConfigOf } from './config.ts'
export type { LogFields, Logger } from './logger.ts'
export { Refusal } from './refusal.ts'
