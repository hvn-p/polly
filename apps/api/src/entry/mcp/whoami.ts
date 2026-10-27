import { z } from 'zod'
import { defineTool } from './index.ts'

export const whoami = defineTool({
  name: 'whoami',
  description:
    'Returns the identifier of the learner this connection is signed in as. Call it to check that Polly is reachable and that you are signed in.',
  inputSchema: z.object({}),
  outputSchema: z.object({ learnerId: z.string() }),
  handle: async (_input, { learnerId }) => ({ learnerId }),
})
