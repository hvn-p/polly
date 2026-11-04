// The machine's own tools: exclusive locks, the prerequisite probe; and the
// paths of the tools the project installs.

export { type Lock, lock, tryLock } from './lock.ts'
export { type Exec, prerequisites, probePrerequisites } from './prerequisites.ts'
export { AGENT_BROWSER, PORTLESS } from './tools.ts'
