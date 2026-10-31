import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'queue',
    setupFiles: ['../../vitest.setup.ts'],
  },
})
