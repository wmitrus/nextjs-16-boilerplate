import type { Config } from 'jest';

import baseConfig from './jest.config';

const config: Config = {
  ...baseConfig,
  displayName: 'unit',
  testMatch: ['**/src/**/*.test.ts?(x)', '**/scripts/**/*.test.ts?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '\\.integration\\.test\\.tsx?$',
  ],
};

export default config;
