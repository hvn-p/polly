// The worker with its fake analyzer slowed down, so a test can kill it in the
// middle of a task. It says when it starts analyzing.

import { setTimeout as sleep } from 'node:timers/promises'
import { fakeAnalyzer } from '@polly/analysis'
import { runProcess, withTrace } from '@polly/logging'
import { PLACEHOLDER_ANALYSIS } from '@polly/queue'
import { startWorker } from '../../src/worker.ts'

await runProcess({
  name: 'polly-worker',
  start: () =>
    startWorker({
      databaseUrl: process.env['DATABASE_URL'] ?? '',
      task: PLACEHOLDER_ANALYSIS,
      trace: withTrace,
      analyzer: {
        analyze: async (recordingId) => {
          process.stdout.write(`analyzing ${recordingId}\n`)
          await sleep(60_000)
          return fakeAnalyzer.analyze(recordingId)
        },
      },
    }),
})
