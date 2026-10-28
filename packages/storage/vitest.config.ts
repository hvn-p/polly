import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'storage',
    setupFiles: ['../../vitest.setup.ts'],
  },
})
