import { type LogRecord, plugLogSink } from '@polly/platform'
import { describe, expect, it } from 'vitest'
import { dbosLogger } from './index.ts'

describe("DBOS's log", () => {
  it('writes each of its reports as a technical event of the queue, at the level DBOS gives', () => {
    const records: LogRecord[] = []
    plugLogSink({ write: (record) => records.push(record) })
    const logger = dbosLogger()
    logger.debug('step')
    logger.info('launched')
    logger.warn('retrying')
    logger.error(new Error('lost'))
    expect(
      records.map(({ event, fields, source }) => ({
        event: event.name,
        category: event.category,
        level: event.level,
        tier: source.tier,
        fields,
      })),
    ).toEqual([
      {
        event: 'queue.dbos.debug',
        category: 'technical',
        level: 'debug',
        tier: 'adapters',
        fields: { message: 'step' },
      },
      {
        event: 'queue.dbos.info',
        category: 'technical',
        level: 'info',
        tier: 'adapters',
        fields: { message: 'launched' },
      },
      {
        event: 'queue.dbos.warning',
        category: 'technical',
        level: 'warn',
        tier: 'adapters',
        fields: { message: 'retrying' },
      },
      {
        event: 'queue.dbos.error',
        category: 'technical',
        level: 'error',
        tier: 'adapters',
        fields: { message: new Error('lost') },
      },
    ])
  })
})
