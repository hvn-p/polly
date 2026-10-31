import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'analysis',
    setupFiles: ['../../vitest.setup.ts'],
  },
})
