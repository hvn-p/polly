import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'architecture-npm',
    setupFiles: ['../../../vitest.setup.ts'],
  },
})
