import React from 'react';
import { vi } from 'vitest';

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

// Mock the composition root to avoid real DB/Clerk initialization in unit tests
vi.mock('../src/core/runtime/bootstrap', async () => {
  const { Container } = await import('../src/core/container');

  const container = new Container();
  container.register(AUTH.IDENTITY_PROVIDER, {
    getCurrentIdentity: vi.fn().mockResolvedValue(null),
  });
  container.register(AUTH.TENANT_RESOLVER, {
    resolve: vi.fn().mockResolvedValue({
      tenantId: 'test-tenant',
      userId: 'test-user',
    }),
  });
  container.register(AUTH.USER_REPOSITORY, {
    updateAttributes: vi.fn(),
  });
  container.register(AUTHORIZATION.SERVICE, {
    can: vi.fn().mockResolvedValue(true),
  });
  container.register(AUTHORIZATION.ROLE_REPOSITORY, {
    getRoles: vi.fn().mockResolvedValue([ROLES.USER]),
  });
  container.register(AUTHORIZATION.MEMBERSHIP_REPOSITORY, {});
  container.register(AUTHORIZATION.POLICY_REPOSITORY, {});

  return {
    appContainer: container,
    createApp: vi.fn(() => container),
  };
});

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
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => server.close());
