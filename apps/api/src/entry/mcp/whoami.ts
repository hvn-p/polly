import { z } from 'zod'
import type { ToolDefinition } from './index.ts'

export const whoami: ToolDefinition = (server, { learnerId }) => {
  server.registerTool(
    'whoami',
    {
      description:
        'Returns the identifier of the learner this connection is signed in as. Call it to check that Polly is reachable and that you are signed in.',
      outputSchema: z.object({ learnerId: z.string() }),
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify({ learnerId }) }],
      structuredContent: { learnerId },
    }),
  )
}
