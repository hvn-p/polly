// What a worktree holds, as recorded by dev:up: dev:down releases exactly
// this, whatever the branch is called by then.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Refusal } from '@polly/platform'
import { parseEnv } from '../config/index.ts'
import { resourceNames } from '../identity/index.ts'
import type { BucketAccess, DatabaseAccess, SupervisedProcess, SupervisorState } from '../ports/index.ts'
import type { Worktree } from './worktree.ts'

export interface WorktreeState {
  supervisor?: SupervisorState
  // The digest of the processes the supervisor was started with.
  processes?: string
  route?: string
  architectureRoute?: string
  role?: string
  garageKeyId?: string
  // The fingerprint of the compute service the real worker uses.
  compute?: string
}

// What a supervisor runs, recorded so that dev:up restarts one whose
// processes changed.
export function digestOf(processes: readonly SupervisedProcess[]): string {
  return createHash('sha256').update(JSON.stringify(processes)).digest('hex')
}

export function readState(worktree: Worktree): WorktreeState {
  return existsSync(worktree.stateFile)
    ? (JSON.parse(readFileSync(worktree.stateFile, 'utf8')) as WorktreeState)
    : {}
}

export function writeState(worktree: Worktree, state: WorktreeState): void {
  mkdirSync(dirname(worktree.stateFile), { recursive: true })
  writeFileSync(worktree.stateFile, `${JSON.stringify(state, null, 2)}\n`)
}

export function deleteState(worktree: Worktree): void {
  rmSync(worktree.stateFile, { force: true })
}

export function readEnv(worktree: Worktree): Record<string, string> | undefined {
  return existsSync(worktree.envFile)
    ? Object.fromEntries(parseEnv(readFileSync(worktree.envFile, 'utf8')))
    : undefined
}

export function required(env: Record<string, string>, key: string): string {
  const value = env[key]
  if (value === undefined || value === '') {
    throw new Refusal('WORKTREE_NOT_CONFIGURED', `${key} is missing from .env.local; run nr dev:up`)
  }
  return value
}

// The resources a worktree's configuration names, from its recorded identity.
export function resourcesOf(env: Record<string, string>) {
  const identity = required(env, 'POLLY_WORKTREE_ID')
  const names = resourceNames(identity)
  const database: DatabaseAccess = {
    names: { role: names.role, database: names.database, testDatabase: names.testDatabase },
    password: decodeURIComponent(new URL(required(env, 'DATABASE_URL')).password),
  }
  return {
    identity,
    route: `${identity}.polly`,
    host: names.host,
    // The architecture view's own host name, one level under the worktree's.
    architectureRoute: `arch.${identity}.polly`,
    architectureHost: `arch.${names.host}`,
    database,
    bucket: required(env, 'S3_BUCKET'),
  }
}

export function bucketAccessOf(env: Record<string, string>): BucketAccess {
  return {
    bucket: required(env, 'S3_BUCKET'),
    accessKeyId: required(env, 'S3_ACCESS_KEY_ID'),
    secretAccessKey: required(env, 'S3_SECRET_ACCESS_KEY'),
  }
}
