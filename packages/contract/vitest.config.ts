import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'contract',
    setupFiles: ['../../vitest.setup.ts'],
  },
})
