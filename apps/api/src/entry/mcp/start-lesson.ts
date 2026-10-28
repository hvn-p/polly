import { Refusal } from '@polly/platform'
import { z } from 'zod'
import type { EventCodes } from '../agent-events/codes.ts'
import { eventCode } from '../contracts/agent-events.ts'
import { defineTool, type ToolDefinition } from './index.ts'

const REFUSALS = {
  INVALID_EVENT_CODE: 'the event code must be the 43 characters your event listener printed',
  EVENT_CODE_ALREADY_BOUND:
    'this event code belongs to another learner; ask your event listener for a new one',
  EVENT_CODE_REVOKED: 'this event code was revoked; use the new one your event listener prints',
}

function refused(code: keyof typeof REFUSALS): Refusal {
  return new Refusal(code, REFUSALS[code])
}

export function startLesson(codes: EventCodes): ToolDefinition {
  return defineTool({
    name: 'start_lesson',
    description:
      "Connects the lesson's event stream to the signed-in learner. Call it with the event code your Polly event listener gave you, each time it gives a new one. The code is a secret: do not repeat it to the user.",
    // Bounded here, checked exactly below, so a malformed code gets its
    // named refusal.
    inputSchema: z.object({ code: z.string().max(256) }),
    outputSchema: z.object({ bound: z.literal(true) }),
    handle: async ({ code }, { learnerId }) => {
      if (!eventCode.safeParse(code).success) {
        throw refused('INVALID_EVENT_CODE')
      }
      const outcome = await codes.bind(learnerId, code)
      if (outcome !== 'bound') {
        throw refused(outcome)
      }
      return { bound: true as const }
    },
  })
}
