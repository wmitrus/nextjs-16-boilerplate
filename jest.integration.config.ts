import type { Config } from 'jest';

import baseConfig from './jest.config';

const config: Config = {
  ...baseConfig,
  displayName: 'integration',
  testMatch: ['**/src/**/*.integration.test.ts?(x)'],
};

export default config;
