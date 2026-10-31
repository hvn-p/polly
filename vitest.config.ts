import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/*',
      'dev',
      'packages/*',
      'plugin',
      'scripts',
      'speckit/extensions/issue-sync',
      'tools/architecture/npm',
      'tools/architecture/ui',
    ],
    coverage: {
      provider: 'v8',
      // The gate reads the text report; nothing is written into the repository.
      reporter: ['text'],
      reportsDirectory: 'node_modules/.vitest/coverage',
      include: [
        'apps/*/src/**/*.{ts,tsx}',
        'dev/src/**/*.ts',
        'packages/*/src/**/*.ts',
        'plugin/src/**/*.ts',
        'scripts/**/*.{ts,mjs}',
        'speckit/extensions/*/scripts/**/*.mjs',
        'tools/architecture/analyzer/identity.mjs',
        'tools/architecture/npm/**/*.{js,mjs}',
        'tools/architecture/ui/src/**/*.{ts,tsx}',
      ],
      // Each exclusion's reason is recorded in scripts/checks/strict-configs.mjs,
      // which refuses one it does not record.
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/test/**',
        '**/vitest.config.ts',
        'dev/src/supervisor/main.ts',
        'plugin/src/agent-events.ts',
        'tools/architecture/npm/launcher/bin/architecture.js',
        'dev/src/e2e/claude.ts',
        'tools/architecture/ui/src/review-snapshot.ts',
        'packages/migrations/src/migrations/**',
        'scripts/checks/agents-md.mjs',
      ],
      thresholds: { lines: 90 },
    },
  },
})
