// The machine's own tools, usable before Polly's dependencies are installed:
// exclusive locks, the prerequisite probe, the dependency install; and the
// paths of the tools the project installs.

export { installDependencies } from './dependencies.ts'
export { type Lock, lock, tryLock } from './lock.ts'
export { type Exec, prerequisites, probePrerequisites } from './prerequisites.ts'
export { AGENT_BROWSER, PORTLESS } from './tools.ts'
