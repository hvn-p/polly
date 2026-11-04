// Describes the learner a request names: who the home page and an agent's
// whoami show.

import { describe, type LearnerDirectory } from '../../domains/accounts/index.ts'

export function describeLearner(
  { directory }: { directory: LearnerDirectory },
  learnerId: string,
): Promise<{ learnerId: string; name: string }> {
  return describe(directory, learnerId)
}
