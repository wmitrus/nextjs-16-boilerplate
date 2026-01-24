import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.tsx', './tests/polyfills.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.integration.test.{ts,tsx}', 'src/stories/**'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/unit',
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.{ts,tsx}'],
      exclude: [
        'src/app/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.integration.test.{ts,tsx}',
        '**/tests/**',
        '**/__tests__/**',
        '**/mocks/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/types.{ts,tsx}',
        'src/**/types/**',
        'src/**/index.{ts,tsx}',
        'src/stories/**',
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
