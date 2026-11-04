import { join } from 'node:path'
import { defineProject } from 'vitest/config'
import { vitestLogPlugin } from '../../scripts/build/log-plugin.ts'

export default defineProject({
  plugins: [vitestLogPlugin(join(import.meta.dirname, '..', '..'))],
  test: {
    name: 'api',
    setupFiles: ['../../vitest.setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
  },
})
