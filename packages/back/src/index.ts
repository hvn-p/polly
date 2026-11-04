// The back: the flows the processes call, and the ports the adapters implement.

export type { LearnerAccount, LearnerAccounts, LearnerDirectory } from './domains/accounts/index.ts'
export type { AnalysisQueue, AnalysisResult, Analyzer } from './domains/analysis/index.ts'
export type { CodeState, EventCodeStore } from './domains/event-codes/index.ts'
export { bindingOf, connectEventStream } from './flows/connect-event-stream/index.ts'
export { describeLearner } from './flows/describe-learner/index.ts'
export { runPlaceholderAnalysis } from './flows/run-placeholder-analysis/index.ts'
export { DEMO_ACCOUNT, seedDemoAccount } from './flows/seed-demo-account/index.ts'
export { startLesson } from './flows/start-lesson/index.ts'
export { submitPlaceholderAnalysis } from './flows/submit-placeholder-analysis/index.ts'
