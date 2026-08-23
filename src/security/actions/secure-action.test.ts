import '@/testing/infrastructure/clerk';
import '@/testing/infrastructure/next-headers';
import '@/testing/infrastructure/logger';

import { vi } from 'vitest';
import { z } from 'zod';

import type { AuthorizationService } from '@/core/contracts/authorization';
import { MissingTenantContextError } from '@/core/contracts/tenancy';
import { PublicError } from '@/core/error/public-error';

import { logActionAudit } from './action-audit';
import { validateReplayToken } from './action-replay';
import { createSecureAction } from './secure-action';

import { AuthorizationError } from '@/security/core/authorization-facade';
import {
  createMockSecurityContext,
  mockChildLogger,
  resetAllInfrastructureMocks,
} from '@/testing';
import { mockEnv } from '@/testing/infrastructure/env';

// Initialize mocks for sub-modules
vi.mock('./action-audit', () => ({
  logActionAudit: vi.fn(),
}));

vi.mock('./action-replay', () => ({
  validateReplayToken: vi.fn(),
}));

describe('Secure Action Wrapper', () => {
  const mockCtx = createMockSecurityContext({
    user: { id: 'user_123', tenantId: 'tenant_123' },
  });
  const schema = z.object({ name: z.string() });

  const mockGetSecurityContext = vi.fn();
  const mockAuthorizationService = {
    can: vi.fn(),
  } as unknown as AuthorizationService;

  const getDependencies = () => ({
    getSecurityContext: mockGetSecurityContext,
    authorizationService: mockAuthorizationService,
  });

  beforeEach(() => {
    resetAllInfrastructureMocks();
    vi.clearAllMocks();
    mockGetSecurityContext.mockResolvedValue(mockCtx);
    vi.mocked(mockAuthorizationService.can).mockResolvedValue(true);
  });

  it('should execute handler and return success', async () => {
    const handler = vi.fn().mockResolvedValue({ id: 1 });
    const action = createSecureAction({
      schema,
      dependencies: getDependencies(),
      handler,
    });

    const result = await action({ name: 'test', _replayToken: 'token123' });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toEqual({ id: 1 });
    }
    expect(handler).toHaveBeenCalledWith({
      input: { name: 'test' },
      context: mockCtx,
    });
    expect(logActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'success' }),
    );
  });

  it('should return validation_error on invalid input', async () => {
    const handler = vi.fn();
    const action = createSecureAction({
      schema,
      dependencies: getDependencies(),
      handler,
    });

    // @ts-expect-error - testing invalid input
    const result = await action({ name: 123, _replayToken: 'token123' });

    expect(result.status).toBe('validation_error');
    expect(handler).not.toHaveBeenCalled();
    expect(logActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failure' }),
    );
  });

  it('should return unauthorized on authorization failure', async () => {
    vi.mocked(mockAuthorizationService.can).mockRejectedValue(
      new AuthorizationError('Denied'),
    );
    const handler = vi.fn();
    const action = createSecureAction({
      schema,
      dependencies: getDependencies(),
      handler,
    });

    const result = await action({ name: 'test', _replayToken: 'token123' });

    expect(result.status).toBe('unauthorized');
    if (result.status === 'unauthorized') {
      expect(result.error).toBe('Denied');
    }
  });

  it('should validate replay token on every action call', async () => {
    const handler = vi.fn().mockResolvedValue({});
    const action = createSecureAction({
      schema,
      dependencies: getDependencies(),
      handler,
    });

    await action({ name: 'test', _replayToken: 'token123' });

    expect(validateReplayToken).toHaveBeenCalledWith('token123', mockCtx);
  });

  it('should return error when replay token is missing', async () => {
    vi.mocked(validateReplayToken).mockRejectedValueOnce(
      new Error('Replay protection token missing'),
    );
    const handler = vi.fn().mockResolvedValue({});
    const action = createSecureAction({
      schema,
      dependencies: getDependencies(),
      handler,
    });

    const result = await action({ name: 'test' });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toBe('Replay protection token missing');
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return error status on generic failure', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Internal Boom'));
    const action = createSecureAction({
      schema,
      dependencies: getDependencies(),
      handler,
    });

    const result = await action({ name: 'test', _replayToken: 'token123' });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toBe('Internal Boom');
    }
  });

  // SEC-37: exposure used to be decided by `message.includes('Failed query:')`,
  // which inverts the safe default -- every exception nobody thought to
  // filter was returned verbatim. These tests pin the inverted rule: nothing
  // is exposed unless it was deliberately authored for a user.
  describe('error exposure (SEC-37)', () => {
    const DB_ERROR =
      'Failed query: select "user_id" from "auth_user_identities" where id = $1';

    async function runFailing(error: unknown) {
      const handler = vi.fn().mockRejectedValue(error);
      const action = createSecureAction({
        schema,
        dependencies: getDependencies(),
        handler,
      });
      return action({ name: 'test', _replayToken: 'token123' });
    }

    it('never returns a raw driver message in production', async () => {
      mockEnv.NODE_ENV = 'production';

      const result = await runFailing(new Error(DB_ERROR));

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error).not.toContain('Failed query');
        expect(result.error).not.toContain('auth_user_identities');
        expect(result.error).toContain(result.correlationId);
      }
    });

    // The class of bug this replaces: an unrecognised exception shape used to
    // fall straight through to the client. Any of these would have leaked.
    it.each([
      [
        'filesystem path',
        new Error("ENOENT: no such file '/var/app/secrets/k'"),
      ],
      ['provider SDK', new Error('Clerk: invalid secret key sk_live_abc123')],
      ['connection', new TypeError('fetch failed')],
      ['non-Error throw', 'a bare string with /internal/path'],
    ])('never returns a raw %s error in production', async (_label, thrown) => {
      mockEnv.NODE_ENV = 'production';

      const result = await runFailing(thrown);

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error).toBe(
          `Something went wrong. Reference: ${result.correlationId}`,
        );
      }
    });

    it('returns the real message outside production for debuggability', async () => {
      mockEnv.NODE_ENV = 'development';

      const result = await runFailing(new Error(DB_ERROR));

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error).toBe(DB_ERROR);
        expect(result.correlationId).toBeTruthy();
      }
    });

    it('exposes a PublicError message even in production', async () => {
      mockEnv.NODE_ENV = 'production';

      const result = await runFailing(
        new PublicError('Your export is still processing. Try again shortly.'),
      );

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error).toBe(
          'Your export is still processing. Try again shortly.',
        );
      }
    });

    it('logs the full detail server-side under the correlation id it returned', async () => {
      mockEnv.NODE_ENV = 'production';

      const result = await runFailing(new Error(DB_ERROR));

      expect(result.status).toBe('error');
      if (result.status !== 'error') return;

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'action:unhandled_error',
          correlationId: result.correlationId,
          errorMessage: DB_ERROR,
        }),
        expect.any(String),
      );
    });

    it('still exposes an AuthorizationError message, which is always ours', async () => {
      mockEnv.NODE_ENV = 'production';

      const result = await runFailing(
        new AuthorizationError('You cannot edit this organization.'),
      );

      expect(result.status).toBe('unauthorized');
      if (result.status === 'unauthorized') {
        expect(result.error).toBe('You cannot edit this organization.');
      }
    });
  });

  it('should return tenant_context_required when tenant is missing', async () => {
    mockGetSecurityContext.mockRejectedValue(new MissingTenantContextError());

    const handler = vi.fn();
    const action = createSecureAction({
      schema,
      dependencies: getDependencies(),
      handler,
    });

    const result = await action({ name: 'test' });

    expect(result.status).toBe('tenant_context_required');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['BOOTSTRAP_REQUIRED', 'bootstrap_required'],
    ['ONBOARDING_REQUIRED', 'onboarding_required'],
    ['ACCOUNT_DISABLED', 'account_disabled'],
    ['TENANT_CONTEXT_REQUIRED', 'tenant_context_required'],
    ['TENANT_MEMBERSHIP_REQUIRED', 'tenant_membership_required'],
  ] as const)(
    'should return %s as typed readiness response',
    async (readinessStatus, expectedStatus) => {
      const handler = vi.fn();
      mockGetSecurityContext.mockResolvedValue(
        createMockSecurityContext({
          user: undefined,
          readinessStatus,
        }),
      );

      const action = createSecureAction({
        schema,
        dependencies: getDependencies(),
        handler,
      });

      const result = await action({ name: 'test', _replayToken: 'token123' });

      expect(result.status).toBe(expectedStatus);
      expect(handler).not.toHaveBeenCalled();
      expect(logActionAudit).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'failure' }),
      );
    },
  );

  it('should return unauthorized when readinessStatus is UNAUTHENTICATED', async () => {
    const handler = vi.fn();
    mockGetSecurityContext.mockResolvedValue(
      createMockSecurityContext({
        user: undefined,
        readinessStatus: 'UNAUTHENTICATED',
      }),
    );

    const action = createSecureAction({
      schema,
      dependencies: getDependencies(),
      handler,
    });

    const result = await action({ name: 'test', _replayToken: 'token123' });

    expect(result.status).toBe('unauthorized');
    if (result.status === 'unauthorized') {
      expect(result.error).toBe('Authentication required');
    }
    expect(handler).not.toHaveBeenCalled();
    expect(logActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failure' }),
    );
  });
});
