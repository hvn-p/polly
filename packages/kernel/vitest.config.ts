import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'kernel',
    setupFiles: ['../../vitest.setup.ts'],
  },
})
