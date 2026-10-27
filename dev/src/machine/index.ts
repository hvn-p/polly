// The machine's own tools, usable before Polly's dependencies are installed:
// exclusive locks, the prerequisite probe, the dependency install.

export { installDependencies } from './dependencies.ts'
export { type Lock, lock, tryLock } from './flock.ts'
export { type Exec, prerequisites, probePrerequisites } from './prerequisites.ts'
