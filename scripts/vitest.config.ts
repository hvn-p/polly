import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'scripts',
    setupFiles: ['../vitest.setup.ts'],
  },
})
