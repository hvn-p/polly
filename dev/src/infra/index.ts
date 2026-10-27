// The adapters of the machine's shared infrastructure, which need Polly's
// dependencies installed: compose, Postgres, Garage, portless, the port table.

export { type ComposeInfrastructure, composeInfrastructure, run, sharedInfrastructure } from './compose.ts'
export { garageAdmin } from './garage.ts'
export { listeningPorts } from './listening.ts'
export { portless, portlessRoutes } from './portless.ts'
export { postgresAdmin } from './postgres.ts'
