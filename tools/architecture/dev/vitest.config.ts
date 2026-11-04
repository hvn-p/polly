import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'architecture-dev',
    setupFiles: ['../../../vitest.setup.ts'],
  },
})
