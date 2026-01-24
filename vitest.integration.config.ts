import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.tsx', './tests/polyfills.ts'],
    include: ['src/**/*.integration.test.{ts,tsx}'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/integration',
      include: ['src/app/**', 'src/features/**'],
      exclude: [
        'src/features/**/*.test.{ts,tsx}',
        'scripts/**',
        'src/core/**',
        'src/shared/utils/**',
        '**/__tests__/**',
        '**/mocks/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/types.{ts,tsx}',
        'src/**/types/**',
        'src/**/index.{ts,tsx}',
      ],
      clean: true,
      cleanOnRerun: true,
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
