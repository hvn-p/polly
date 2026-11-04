import { defineEvent } from '@polly/platform'

export const COMPUTE_VERSION_MISMATCHED = defineEvent('analysis.compute_version.mismatched', {
  category: 'technical',
  level: 'warn',
  investigate:
    "the compute service runs other code than the worktree's services/compute: rebuild it, or mean it",
})

export const COMPUTE_VERSION_UNKNOWN = defineEvent('analysis.compute_version.unknown', {
  category: 'technical',
  level: 'warn',
  investigate: 'the compute service did not report its version: is it up at that URL?',
})
