import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  optimizeDeps: {
    include: ['storybook/test', 'clsx', 'tailwind-merge'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['.storybook/vitest.setup.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/storybook',
      exclude: ['**/*.css', '.storybook/**'],
    },
    projects: [
      {
        test: {
          name: 'storybook',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['.storybook/vitest.setup.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
        },
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
            storybookScript: 'pnpm storybook --no-open', // Dostosuj do swojego package.json
          }),
        ],
      },
    ],
  },
});
