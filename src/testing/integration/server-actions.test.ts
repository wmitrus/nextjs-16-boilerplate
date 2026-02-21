/** @vitest-environment node */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

import { createSecureAction } from '@/security/actions/secure-action';
import type { SecurityContext } from '@/security/core/security-context';
import { mockAuth, resetClerkMocks } from '@/testing/infrastructure/clerk';
import { resetEnvMocks } from '@/testing/infrastructure/env';
import {
  mockChildLogger,
  resetLoggerMocks,
} from '@/testing/infrastructure/logger';
import {
  mockHeaders,
  resetNextHeadersMocks,
} from '@/testing/infrastructure/next-headers';

// Explicitly mock clerk to ensure it's picked up
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
  clerkClient: vi.fn(),
}));

describe('Server Actions Integration', () => {
  const schema = z.object({
    name: z.string().min(3),
  });

  const testHandler = async ({
    input,
    context,
  }: {
    input: { name: string };
    context: SecurityContext;
  }) => {
    return { greeting: `Hello ${input.name}`, userId: context.user?.id };
  };

  beforeEach(() => {
    resetClerkMocks();
    resetNextHeadersMocks();
    resetLoggerMocks();
    resetEnvMocks();
    vi.clearAllMocks();

    // Default headers
    mockHeaders.set('x-forwarded-for', '127.0.0.1');
    mockHeaders.set('user-agent', 'test-agent');
  });

  it('should execute successfully for authorized user', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user_123',
      sessionClaims: {
        metadata: { role: 'user', onboardingComplete: true },
      },
    });

    const action = createSecureAction({
      schema,
      role: 'user',
      handler: testHandler,
    });

    const result = await action({ name: 'Zencoder' });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.greeting).toBe('Hello Zencoder');
      expect(result.data.userId).toBe('user_123');
    }

    // Verify audit log
    expect(mockChildLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        actionName: 'testHandler',
        userId: 'user_123',
        result: 'success',
      }),
      expect.stringContaining('successful'),
    );
  });

  it('should fail with unauthorized for insufficient role', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user_123',
      sessionClaims: {
        metadata: { role: 'user', onboardingComplete: true },
      },
    });

    const action = createSecureAction({
      schema,
      role: 'admin', // Requires admin
      handler: testHandler,
    });

    const result = await action({ name: 'Zencoder' });

    expect(result.status).toBe('unauthorized');

    // Verify failure audit log
    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failure',
        error: expect.stringContaining('Required role: admin'),
      }),
      expect.stringContaining('failed'),
    );
  });

  it('should fail with unauthorized for unauthenticated user', async () => {
    mockAuth.mockResolvedValue({
      userId: null,
      sessionClaims: null,
    });

    const action = createSecureAction({
      schema,
      handler: testHandler,
    });

    const result = await action({ name: 'Zencoder' });

    expect(result.status).toBe('unauthorized');
  });

  it('should return validation errors for invalid input', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user_123',
      sessionClaims: { metadata: { role: 'user' } },
    });

    const action = createSecureAction({
      schema,
      handler: testHandler,
    });

    const result = await action({ name: 'Z' }); // Too short

    expect(result.status).toBe('validation_error');
    if (result.status === 'validation_error') {
      expect(result.errors.name).toBeDefined();
    }
  });

  it('should fail with error for expired replay token', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user_123',
      sessionClaims: { metadata: { role: 'user' } },
    });

    const action = createSecureAction({
      schema,
      handler: testHandler,
    });

    // Token with old timestamp
    const oldTimestamp = Date.now() - 10 * 60 * 1000; // 10 mins ago
    const result = await action({
      name: 'Zencoder',
      _replayToken: `${oldTimestamp}|nonce`,
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toBe('Action expired or invalid timestamp');
    }
  });

  it('should execute successfully with valid replay token', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user_123',
      sessionClaims: { metadata: { role: 'user' } },
    });

    const action = createSecureAction({
      schema,
      handler: testHandler,
    });

    // Token with fresh timestamp
    const now = Date.now();
    const result = await action({
      name: 'Zencoder',
      _replayToken: `${now}|nonce`,
    });

    expect(result.status).toBe('success');
  });
});
