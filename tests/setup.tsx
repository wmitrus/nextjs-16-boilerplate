import '@testing-library/jest-dom';
import React from 'react';
import { vi } from 'vitest';

import { bootstrap } from '../src/core/container';
import { AUTH, AUTHORIZATION } from '../src/core/contracts';
import { ROLES } from '../src/core/contracts/roles';
// Force early initialization of critical infrastructure mocks
import { server } from '../src/shared/lib/mocks/server';
import { mockEnv } from '../src/testing/infrastructure/env';
import {
  mockPino,
  mockGetLogStreams,
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

// Mock modules to avoid real Clerk infrastructure in unit tests
vi.mock('../src/modules/auth', () => ({
  authModule: {
    register: (c: {
      register: (key: string | symbol, value: unknown) => void;
    }) => {
      c.register(AUTH.IDENTITY_PROVIDER, {
        getCurrentIdentity: vi.fn().mockResolvedValue(null),
      });
      c.register(AUTH.TENANT_RESOLVER, {
        resolve: vi.fn().mockResolvedValue({
          tenantId: 'test-tenant',
          userId: 'test-user',
        }),
      });
      c.register(AUTH.USER_REPOSITORY, {
        updateAttributes: vi.fn(),
      });
    },
  },
}));

vi.mock('../src/modules/authorization', () => ({
  authorizationModule: {
    register: (c: {
      register: (key: string | symbol, value: unknown) => void;
    }) => {
      c.register(AUTHORIZATION.SERVICE, {
        can: vi.fn().mockResolvedValue(true),
      });
      c.register(AUTHORIZATION.ROLE_REPOSITORY, {
        getRoles: vi.fn().mockResolvedValue([ROLES.USER]),
      });
      c.register(AUTHORIZATION.MEMBERSHIP_REPOSITORY, {});
      c.register(AUTHORIZATION.POLICY_REPOSITORY, {});
    },
  },
}));

// Global mocks for core services to prevent un-mocked side effects
vi.mock('pino', () => ({
  default: mockPino,
  __esModule: true,
}));

vi.mock('../src/core/logger/streams', () => ({
  getLogStreams: mockGetLogStreams,
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

beforeAll(() => {
  server.listen();
  bootstrap();
});
afterEach(() => {
  server.resetHandlers();
  // Reset container mocks if needed or re-bootstrap
});
afterAll(() => server.close());
