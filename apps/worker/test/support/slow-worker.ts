// The worker with its fake analyzer slowed down, so a test can kill it in the
// middle of a task. It says when it starts analyzing.

import { setTimeout as sleep } from 'node:timers/promises'
import { fakeAnalyzer } from '@polly/analysis'
import { createLogger } from '@polly/logging'
import { startWorker } from '../../src/main.ts'

await startWorker({
  databaseUrl: process.env['DATABASE_URL'] ?? '',
  analyzer: {
    analyze: async (recordingId) => {
      process.stdout.write(`analyzing ${recordingId}\n`)
      await sleep(60_000)
      return fakeAnalyzer.analyze(recordingId)
    },
  },
  log: createLogger({ name: 'polly-worker' }),
})
