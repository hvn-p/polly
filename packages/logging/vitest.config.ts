import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'logging',
    setupFiles: ['../../vitest.setup.ts'],
  },
})
