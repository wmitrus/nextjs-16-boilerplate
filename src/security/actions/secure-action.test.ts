import '@/testing/infrastructure/clerk';
import '@/testing/infrastructure/next-headers';
import '@/testing/infrastructure/logger';
import '@/security/core/security-context.mock';
import '@/security/core/authorization.mock';

import { z } from 'zod';

import { logActionAudit } from './action-audit';
import { validateReplayToken } from './action-replay';
import { createSecureAction } from './secure-action';

import { AuthorizationError } from '@/security/core/authorization';
import {
  createMockSecurityContext,
  mockAuthorize,
  mockGetSecurityContext,
  resetAllInfrastructureMocks,
} from '@/testing';

// Initialize mocks for sub-modules
vi.mock('./action-audit', () => ({
  logActionAudit: vi.fn(),
}));

vi.mock('./action-replay', () => ({
  validateReplayToken: vi.fn(),
}));

describe('Secure Action Wrapper', () => {
  const mockCtx = createMockSecurityContext({
    user: { id: 'user_123', role: 'user', tenantId: 'tenant_123' },
  });
  const schema = z.object({ name: z.string() });

  beforeEach(() => {
    resetAllInfrastructureMocks();
    vi.clearAllMocks();
    mockGetSecurityContext.mockResolvedValue(mockCtx);
    mockAuthorize.mockImplementation(() => {});
  });

  it('should execute handler and return success', async () => {
    const handler = vi.fn().mockResolvedValue({ id: 1 });
    const action = createSecureAction({ schema, handler });

    const result = await action({ name: 'test' });

    expect(result.status).toBe('success');
    expect(result.data).toEqual({ id: 1 });
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
    const action = createSecureAction({ schema, handler });

    // @ts-expect-error - testing invalid input
    const result = await action({ name: 123 });

    expect(result.status).toBe('validation_error');
    expect(handler).not.toHaveBeenCalled();
    expect(logActionAudit).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failure' }),
    );
  });

  it('should return unauthorized on authorization failure', async () => {
    mockAuthorize.mockImplementation(() => {
      throw new AuthorizationError('Denied');
    });
    const handler = vi.fn();
    const action = createSecureAction({ schema, handler });

    const result = await action({ name: 'test' });

    expect(result.status).toBe('unauthorized');
    expect(result.error).toBe('Denied');
  });

  it('should validate replay token if provided', async () => {
    const handler = vi.fn().mockResolvedValue({});
    const action = createSecureAction({ schema, handler });

    await action({ name: 'test', _replayToken: 'token123' });

    expect(validateReplayToken).toHaveBeenCalledWith('token123', mockCtx);
  });
});
