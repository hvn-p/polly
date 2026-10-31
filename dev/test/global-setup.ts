// Runs once before the dev tests: builds every process, since the commands
// start the supervisor, the migrations and the API's command line from their
// builds.

import { bundleProcess, PROCESSES, pathsOf } from '../../scripts/build/processes.ts'

export default async function setup(): Promise<void> {
  for (const target of PROCESSES) {
    await bundleProcess(pathsOf(target))
  }
}
