import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'speckit-issue-sync',
    setupFiles: ['../../../vitest.setup.ts'],
  },
})
