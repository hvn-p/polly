import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'back',
    setupFiles: ['../../vitest.setup.ts'],
  },
})
