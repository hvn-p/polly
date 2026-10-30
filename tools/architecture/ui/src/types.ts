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
  // Past `line` when the import is written over several lines.
  endLine: number
  spec: string
  typeOnly: boolean
  names: string[]
  // Where the file uses the names that reach `to`.
  uses: Use[]
}

// A line from 1, and its columns from 0 in UTF-16 code units, as JavaScript counts them.
export interface Use {
  line: number
  column: number
  endColumn: number
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

// The analyzer's sources an analyzer or a view was built from (identity.mjs).
export interface Identity {
  fingerprint: string
  commit: string
  // ISO 8601.
  date: string
  modified: boolean
  // When modified: when the latest local change was saved, ISO 8601.
  changed?: string
}
