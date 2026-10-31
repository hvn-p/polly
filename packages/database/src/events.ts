import { defineEvent } from '@polly/platform'

export const SCHEMA_BEHIND = defineEvent('database.schema.behind', {
  category: 'technical',
  level: 'warn',
  investigate: 'the database lacks a migration the code needs: run nr dev:up; the process waits until then',
})
