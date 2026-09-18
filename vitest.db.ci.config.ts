import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'db-ci',
    environment: 'node',
    globals: true,
    // `src/**/*.db.test.ts` is driver-agnostic (via `resolveTestDb()`,
    // which consumes `globalSetup`'s injected `TEST_DATABASE_URL`).
    // `scripts/audit-log/**/*.db.test.ts` follows the same driver-agnostic
    // contract and is included here for AUD·C real-Postgres coverage.
    // `scripts/tenancy-inventory/**/*.db.test.ts` is NOT driver-agnostic --
    // by deliberate OZI-75/OZI-79 design, `readonly-db.ts`'s `LocalTarget`
    // and the tenancy-inventory role-management tests only ever target the
    // fixed `127.0.0.1:5433` constant (`scripts/lib/db-guard.mjs`'s
    // `TEST_DEFAULT_URL`). This CI job's workflow provisions a Postgres
    // service on that exact fixed port for those suites to reach.
    include: [
      'src/**/*.db.test.ts',
      'scripts/audit-log/**/*.db.test.ts',
      'scripts/tenancy-inventory/**/*.db.test.ts',
      'scripts/audit-log/**/*.db.test.ts',
    ],
    globalSetup: ['tests/db/setup.postgres.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/db-ci',
      include: [
        'src/modules/**/infrastructure/drizzle/*.ts',
        'src/core/db/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.db.test.ts',
        '**/schema.ts',
        '**/seed.ts',
        '**/migrations/**',
      ],
    },
  },
});
