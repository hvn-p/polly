import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['apps/*', 'dev', 'plugin', 'scripts'],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'dev/src/**', 'plugin/bin/**', 'scripts/**'],
      thresholds: { lines: 90 },
    },
  },
})
