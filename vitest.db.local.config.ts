import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'db-local',
    environment: 'node',
    globals: true,
    include: ['src/**/*.db.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/db-local',
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
