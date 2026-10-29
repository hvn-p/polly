// The analyzer's report, as `architecture json` and the watch mode write it.

export type MayImport = string | { tier: string; onlyFrom: string[]; typesOnly: boolean }

export interface Tier {
  id: string
  group: string
  name: string
  criterion: string
  paths: string[]
  mayImport: MayImport[]
  isolated?: string | null
  technologies?: string[] | null
  fix: string
  typesFix?: string | null
  technologyFix?: string | null
}

export interface Module {
  id: string
  tier: string
  package: string
  files: string[]
}

export interface Edge {
  from: string
  to: string
  file: string
  line: number
  spec: string
  typeOnly: boolean
  names: string[]
}

export interface Technology {
  module: string | null
  file: string
  line: number
  name: string
}

export interface Violation {
  rule: string
  file: string
  line: number
  message: string
  fix: string
}

export type Pair = [from: string, to: string]

export interface Report {
  name: string | null
  tiers: Tier[]
  modules: Module[]
  edges: Edge[]
  technologies: Technology[]
  violations: Violation[]
  base: { ref: string; head: string | null; added: Pair[]; removed: Pair[] } | null
}

// One change to the architecture during the session.
export interface Change {
  at: number
  files: string[]
  added: Pair[]
  removed: Pair[]
  breaches: Violation[]
  fixed: Violation[]
}
