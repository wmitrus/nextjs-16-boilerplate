import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

// Force early initialization of critical infrastructure mocks
import { server } from '../src/shared/lib/mocks/server';
import { mockEnv } from '../src/testing/infrastructure/env';
import {
  mockPino,
  mockGetLogStreams,
  mockLogger,
} from '../src/testing/infrastructure/logger';
import {
  mockNextHeaders,
  mockCookies,
} from '../src/testing/infrastructure/next-headers';

process.env.CLERK_SECRET_KEY = 'sk_test_mock';
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';

// Global mocks for common Next.js APIs
vi.mock('next/headers', () => ({
  headers: mockNextHeaders,
  cookies: mockCookies,
}));

vi.mock('@/core/env', () => ({
  env: mockEnv,
}));

// Global mocks for core services to prevent un-mocked side effects
vi.mock('pino', () => ({
  default: mockPino,
  __esModule: true,
}));

vi.mock('../src/core/logger/streams', () => ({
  getLogStreams: mockGetLogStreams,
}));

vi.mock('../src/core/logger/server', () => ({
  logger: mockLogger,
  getLogger: () => mockLogger,
  getServerLogger: () => mockLogger,
  resetServerLogger: vi.fn(),
  default: mockLogger,
}));

// Mock next/image
vi.mock('next/image', () => {
  return {
    default: function MockImage({
      priority: _priority,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img {...props} alt={props.alt || ''} />;
    },
  };
});

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
