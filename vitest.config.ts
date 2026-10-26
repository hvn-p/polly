import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['apps/*', 'dev', 'plugin', 'scripts'],
    coverage: {
      provider: 'v8',
      // The gate reads the text report; nothing is written into the repository.
      reporter: ['text'],
      reportsDirectory: 'node_modules/.vitest/coverage',
      include: [
        'apps/*/src/**/*.{ts,tsx}',
        'dev/src/**/*.ts',
        'plugin/bin/**/*.mjs',
        'scripts/**/*.{ts,mjs}',
      ],
      exclude: [
        '**/*.test.ts',
        // Applied by the API tests' global setup, in its own process; the
        // startup tests check the schema they produce.
        'apps/api/src/migrations/**',
        // Installed and tested by the baudrier plugin.
        'scripts/checks/agents-md.mjs',
      ],
      thresholds: { lines: 90 },
    },
  },
})
