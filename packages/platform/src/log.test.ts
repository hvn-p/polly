import { describe, expect, it } from 'vitest'
import { log as untagged } from './file-log.ts'
import { defineEvent, type LogRecord, logFrom, plugLogSink } from './index.ts'

const SOURCE = { tier: 'interfaces', module: 'apps/api/src', file: 'apps/api/src/app.ts' }
const SERVED = defineEvent('api.request.served', {
  category: 'access',
  level: 'info',
  investigate: 'the status and duration of one request',
})

describe('the socle logger', () => {
  it('declares an event with its name, category, level and what to investigate', () => {
    expect(SERVED).toEqual({
      name: 'api.request.served',
      category: 'access',
      level: 'info',
      investigate: 'the status and duration of one request',
    })
  })

  it('refuses a name that is not <module>.<subject>.<outcome> in snake case', () => {
    for (const name of [
      'request',
      'api.request',
      'api.Request.served',
      'api.request.served.twice',
      'api..x',
    ]) {
      expect(() => defineEvent(name, { category: 'technical', level: 'warn', investigate: 'x' })).toThrow(
        `${name} is no event name: write <module>.<subject>.<outcome>, in snake case`,
      )
    }
  })

  it('writes nowhere until a sink is plugged in, then hands it the event, fields and source', () => {
    const write = logFrom(SOURCE)
    write(SERVED, { status: 200 })
    const records: LogRecord[] = []
    plugLogSink({ write: (record) => records.push(record) })
    write(SERVED, { status: 204 })
    write(SERVED)
    expect(records).toEqual([
      { event: SERVED, fields: { status: 204 }, source: SOURCE },
      { event: SERVED, fields: {}, source: SOURCE },
    ])
  })

  it('throws from a file built without the log plugin, naming it', () => {
    expect(() => untagged(SERVED)).toThrow(
      'this file was built without the log plugin (scripts/build/log-plugin.ts), which tags its logger',
    )
  })
})
