import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['apps/*', 'dev', 'packages/*', 'plugin', 'scripts'],
    coverage: {
      provider: 'v8',
      // The gate reads the text report; nothing is written into the repository.
      reporter: ['text'],
      reportsDirectory: 'node_modules/.vitest/coverage',
      include: [
        'apps/*/src/**/*.{ts,tsx}',
        'dev/src/**/*.ts',
        'packages/*/src/**/*.ts',
        'plugin/bin/**/*.mjs',
        'scripts/**/*.{ts,mjs}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/vitest.config.ts',
        // Process entry points: the tests run them as the processes they are
        // (the monitor against a stub stream, the supervisor and the API by
        // dev:up), and V8 coverage does not follow a child process.
        'plugin/bin/agent-events.mjs',
        'dev/src/supervisor/main.ts',
        'apps/api/src/entry/main.ts',
        // The driven agent run: on demand, never in CI (nr dev:e2e).
        'dev/src/e2e/claude.ts',
        // Applied by the tests' global setups, in their own process; the
        // startup tests check the schema they produce.
        'packages/migrations/src/migrations/**',
        // Installed and tested by the baudrier plugin.
        'scripts/checks/agents-md.mjs',
      ],
      thresholds: { lines: 90 },
    },
  },
})
