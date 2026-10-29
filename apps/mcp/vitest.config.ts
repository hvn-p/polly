import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'mcp',
    setupFiles: ['../../vitest.setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
  },
})
