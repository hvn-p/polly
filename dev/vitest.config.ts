import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'dev',
    setupFiles: ['../vitest.setup.ts'],
  },
})
