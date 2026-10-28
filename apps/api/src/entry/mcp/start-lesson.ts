import { startLesson as bindEventCode, type EventCodeStore } from '@polly/back'
import { z } from 'zod'
import { defineTool, type ToolDefinition } from './index.ts'

export function startLesson(codes: EventCodeStore): ToolDefinition {
  return defineTool({
    name: 'start_lesson',
    description:
      "Connects the lesson's event stream to the signed-in learner. Call it with the event code your Polly event listener gave you, each time it gives a new one. The code is a secret: do not repeat it to the user.",
    // Bounded here, checked exactly by the back, so a malformed code gets its
    // named refusal.
    inputSchema: z.object({ code: z.string().max(256) }),
    outputSchema: z.object({ bound: z.literal(true) }),
    handle: ({ code }, { learnerId }) => bindEventCode({ codes }, learnerId, code),
  })
}
