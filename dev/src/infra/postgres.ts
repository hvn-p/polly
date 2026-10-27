// A worktree's role and databases in the shared Postgres, set up as the
// platform's provisioner sets up an application (vendors/infra): a role that
// is not a superuser owns the databases, nobody else may connect to them, and
// the extensions are created by the superuser.

import type { PostgresAdmin } from '../ports/index.ts'
import type { ComposeInfrastructure } from './compose.ts'

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/

function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`${name} is not a plain Postgres identifier`)
  }
  return name
}

export function postgresAdmin(compose: Pick<ComposeInfrastructure, 'exec'>): PostgresAdmin {
  // SQL travels on stdin, never on a command line another process could read.
  const psql = (sql: string, database = 'postgres') =>
    compose.exec(
      'postgres',
      ['psql', '-U', 'postgres', '-d', database, '-q', '-tA', '-v', 'ON_ERROR_STOP=1'],
      sql,
    )
  const exists = async (sql: string) => (await psql(sql)).trim() === '1'

  return {
    ensure: async ({ names, password }, extensions) => {
      const role = identifier(names.role)
      const databases = [identifier(names.database), identifier(names.testDatabase)]
      if (!/^[0-9a-zA-Z]+$/.test(password)) {
        throw new Error('the database password must be alphanumeric')
      }
      if (!(await exists(`select 1 from pg_roles where rolname = '${role}'`))) {
        await psql(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${password}';`)
      }
      for (const database of databases) {
        if (!(await exists(`select 1 from pg_database where datname = '${database}'`))) {
          await psql(`create database ${database} owner ${role};`)
          await psql(`revoke connect, temporary on database ${database} from public;`)
        }
        for (const extension of extensions) {
          await psql(`create extension if not exists ${identifier(extension)};`, database)
        }
      }
    },
    release: async (names) => {
      for (const database of [names.database, names.testDatabase]) {
        await psql(`drop database if exists ${identifier(database)} with (force);`)
      }
      await psql(`drop role if exists ${identifier(names.role)};`)
    },
  }
}
