import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'db',
    environment: 'node',
    globals: true,
    // `scripts/**/*.db.test.ts` is deliberately excluded here:
    // `src/**/*.db.test.ts` is driver-agnostic (`resolveTestDb()` falls
    // back to in-process PGlite when no `TEST_DATABASE_URL` is injected,
    // which is this profile's whole point -- no external DB required).
    // `scripts/tenancy-inventory/**/*.db.test.ts`, by contrast, always
    // targets a real fixed-port Postgres container
    // (`readonly-db.ts`'s `LocalTarget`) and cannot run against PGlite --
    // running it under this profile without that container up just hangs
    // or fails. Use `pnpm test:db:local` (real Postgres, both suites) or
    // `pnpm test:db:ci` (the required CI job) for those instead.
    include: ['src/**/*.db.test.ts'],
    pool: 'threads',
    testTimeout: 30_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/db',
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
