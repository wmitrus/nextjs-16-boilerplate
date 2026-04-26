import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/logger/di', async () => {
  const testing = await import('@/testing');
  return {
    resolveServerLogger: vi.fn(() => testing.mockLogger),
  };
});

import { DuplicateWaitlistEntryError } from '../domain/errors';
import type { WaitlistRepository } from '../domain/WaitlistRepository';

import { DefaultWaitlistService } from './DefaultWaitlistService';

import type { EmailService } from '@/modules/invitations/domain/EmailService';
import { mockChildLogger, resetAllInfrastructureMocks } from '@/testing';

describe('DefaultWaitlistService', () => {
  const repository: WaitlistRepository = {
    add: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
    listPending: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  };

  const emailService: EmailService = {
    sendInvitationEmail: vi.fn(),
    sendVerificationEmail: vi.fn(),
    sendWaitlistConfirmationEmail: vi.fn(),
    sendWaitlistRejectionEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };

  const waitlistEntry = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alice@example.com',
    name: 'Alice',
    organizationId: null,
    status: 'pending' as const,
    approvedAt: null,
    notifiedAt: null,
    createdAt: new Date('2026-04-26T10:00:00.000Z'),
  };

  beforeEach(() => {
    resetAllInfrastructureMocks();
    vi.clearAllMocks();
  });

  it('throws DuplicateWaitlistEntryError when the email already exists', async () => {
    vi.mocked(repository.findByEmail).mockResolvedValue(waitlistEntry);
    const service = new DefaultWaitlistService(repository, emailService);

    await expect(
      service.joinWaitlist({ email: 'alice@example.com' }),
    ).rejects.toBeInstanceOf(DuplicateWaitlistEntryError);
    expect(repository.add).not.toHaveBeenCalled();
  });

  it('creates a waitlist entry and sends the confirmation email', async () => {
    vi.mocked(repository.findByEmail).mockResolvedValue(null);
    vi.mocked(repository.add).mockResolvedValue(waitlistEntry);
    vi.mocked(emailService.sendWaitlistConfirmationEmail).mockResolvedValue();

    const service = new DefaultWaitlistService(repository, emailService);
    const result = await service.joinWaitlist({
      email: 'alice@example.com',
      name: 'Alice',
    });

    expect(repository.add).toHaveBeenCalledWith({
      email: 'alice@example.com',
      name: 'Alice',
      organizationId: undefined,
    });
    expect(emailService.sendWaitlistConfirmationEmail).toHaveBeenCalledWith({
      to: 'alice@example.com',
      name: 'Alice',
    });
    expect(result).toEqual(waitlistEntry);
  });

  it('logs and still returns the entry when confirmation email fails', async () => {
    vi.mocked(repository.findByEmail).mockResolvedValue(null);
    vi.mocked(repository.add).mockResolvedValue(waitlistEntry);
    vi.mocked(emailService.sendWaitlistConfirmationEmail).mockRejectedValue(
      new Error('smtp unavailable'),
    );

    const service = new DefaultWaitlistService(repository, emailService);
    const result = await service.joinWaitlist({ email: 'alice@example.com' });

    expect(result).toEqual(waitlistEntry);
    expect(mockChildLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'waitlist:confirmation_email_failed',
        errorMessage: 'smtp unavailable',
        errorName: 'Error',
      }),
      'Failed to send waitlist confirmation email',
    );
  });
});
