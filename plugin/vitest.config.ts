import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'plugin',
    setupFiles: ['../vitest.setup.ts'],
  },
})
