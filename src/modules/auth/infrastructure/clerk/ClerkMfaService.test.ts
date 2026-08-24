import { beforeEach, describe, expect, it, vi } from 'vitest';

const clerkMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  verifyTOTP: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: { getUser: clerkMock.getUser, verifyTOTP: clerkMock.verifyTOTP },
  }),
}));

import { ClerkMfaService } from './ClerkMfaService';

const service = new ClerkMfaService();
const subject = { userId: 'internal-uuid', externalUserId: 'user_clerk_123' };

class ClerkApiError extends Error {
  constructor(readonly status: number) {
    super(`Clerk responded ${status}`);
    this.name = 'ClerkAPIResponseError';
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  clerkMock.getUser.mockResolvedValue({ twoFactorEnabled: true });
});

describe('ClerkMfaService.getStatus', () => {
  it('reports enrollment from Clerk', async () => {
    await expect(service.getStatus(subject)).resolves.toMatchObject({
      enrolled: true,
      enrollmentSurface: 'provider',
    });
    expect(clerkMock.getUser).toHaveBeenCalledWith('user_clerk_123');
  });

  it('reports not enrolled when Clerk says so', async () => {
    clerkMock.getUser.mockResolvedValue({ twoFactorEnabled: false });

    await expect(service.getStatus(subject)).resolves.toMatchObject({
      enrolled: false,
    });
  });

  it('fails closed when Clerk cannot be reached', async () => {
    // An outage must never read as "this account has a second factor" -- that
    // would let an admin mutation through on the strength of a 500.
    clerkMock.getUser.mockRejectedValue(new Error('network down'));

    await expect(service.getStatus(subject)).resolves.toMatchObject({
      enrolled: false,
    });
  });

  it('does not ask Clerk without a Clerk user id', async () => {
    await expect(
      service.getStatus({ userId: 'internal-uuid' }),
    ).resolves.toMatchObject({ enrolled: false });
    expect(clerkMock.getUser).not.toHaveBeenCalled();
  });
});

describe('ClerkMfaService.verifyChallenge', () => {
  it('accepts a verified TOTP code', async () => {
    clerkMock.verifyTOTP.mockResolvedValue({
      verified: true,
      code_type: 'totp',
    });

    await expect(service.verifyChallenge(subject, '123456')).resolves.toEqual({
      ok: true,
      factor: 'otp',
    });
  });

  it('records a backup code as a recovery factor', async () => {
    clerkMock.verifyTOTP.mockResolvedValue({
      verified: true,
      code_type: 'backup_code',
    });

    await expect(
      service.verifyChallenge(subject, 'abcd-efgh'),
    ).resolves.toEqual({ ok: true, factor: 'recovery' });
  });

  it('refuses when the account has no second factor', async () => {
    clerkMock.getUser.mockResolvedValue({ twoFactorEnabled: false });

    await expect(service.verifyChallenge(subject, '123456')).resolves.toEqual({
      ok: false,
      reason: 'not_enrolled',
    });
    expect(clerkMock.verifyTOTP).not.toHaveBeenCalled();
  });

  it('maps a 4xx from Clerk to an invalid code', async () => {
    clerkMock.verifyTOTP.mockRejectedValue(new ClerkApiError(422));

    await expect(service.verifyChallenge(subject, '000000')).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    });
  });

  it.each([[500], [503]])(
    'maps a %d from Clerk to unavailable, never to a pass',
    async (status) => {
      clerkMock.verifyTOTP.mockRejectedValue(new ClerkApiError(status));

      await expect(service.verifyChallenge(subject, '123456')).resolves.toEqual(
        { ok: false, reason: 'unavailable' },
      );
    },
  );

  it('treats an unexpected response body as an invalid code', async () => {
    // The SDK types `verified` as literally `true`; a body that does not say
    // so must not be read as success just because no error was thrown.
    clerkMock.verifyTOTP.mockResolvedValue({});

    await expect(service.verifyChallenge(subject, '123456')).resolves.toEqual({
      ok: false,
      reason: 'invalid_code',
    });
  });
});
