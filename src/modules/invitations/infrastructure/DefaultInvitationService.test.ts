import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/logger/di', async () => {
  const testing = await import('@/testing');
  return {
    resolveServerLogger: vi.fn(() => testing.mockLogger),
  };
});

import {
  InvitationAlreadyUsedError,
  InvitationExpiredError,
} from '../domain/errors';
import type { InvitationRepository } from '../domain/InvitationRepository';
import type { Invitation } from '../domain/types';

import { DefaultInvitationService } from './DefaultInvitationService';

import type { EmailService } from '@/modules/invitations/domain/EmailService';
import { resetAllInfrastructureMocks } from '@/testing';

function buildInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    invitedByUserId: 'user-1',
    email: 'alice@example.com',
    roleId: 'role-1',
    token: 'invite-token',
    status: 'pending',
    expiresAt: new Date('2026-05-01T00:00:00.000Z'),
    acceptedAt: null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    ...overrides,
  };
}

describe('DefaultInvitationService', () => {
  const repository: InvitationRepository = {
    create: vi.fn(),
    findByToken: vi.fn(),
    findPendingByEmailAndOrg: vi.fn(),
    listByOrganization: vi.fn(),
    markAccepted: vi.fn(),
    markRevoked: vi.fn(),
    markExpired: vi.fn(),
  };

  const emailService: EmailService = {
    sendInvitationEmail: vi.fn(),
    sendVerificationEmail: vi.fn(),
    sendWaitlistConfirmationEmail: vi.fn(),
    sendWaitlistRejectionEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };

  beforeEach(() => {
    resetAllInfrastructureMocks();
    vi.clearAllMocks();
  });

  it('returns the persisted accepted invitation state from markAccepted', async () => {
    const pendingInvitation = buildInvitation();
    const acceptedAt = new Date('2026-04-27T10:00:00.000Z');
    const acceptedInvitation = buildInvitation({
      status: 'accepted',
      acceptedAt,
    });
    vi.mocked(repository.findByToken).mockResolvedValue(pendingInvitation);
    vi.mocked(repository.markAccepted).mockResolvedValue(acceptedInvitation);

    const service = new DefaultInvitationService(repository, emailService, {
      appUrl: 'http://localhost:3000',
    });

    await expect(
      service.acceptInvitation({ token: pendingInvitation.token, acceptedAt }),
    ).resolves.toEqual(acceptedInvitation);
    expect(repository.markAccepted).toHaveBeenCalledWith(
      pendingInvitation.id,
      acceptedAt,
    );
  });

  it('throws InvitationAlreadyUsedError when the conditional accept update loses the race', async () => {
    const pendingInvitation = buildInvitation();
    vi.mocked(repository.findByToken).mockResolvedValue(pendingInvitation);
    vi.mocked(repository.markAccepted).mockResolvedValue(null);

    const service = new DefaultInvitationService(repository, emailService, {
      appUrl: 'http://localhost:3000',
    });

    await expect(
      service.acceptInvitation({ token: pendingInvitation.token }),
    ).rejects.toBeInstanceOf(InvitationAlreadyUsedError);
  });

  it('marks overdue pending invitations as expired during validation', async () => {
    const expiredInvitation = buildInvitation({
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
    });
    vi.mocked(repository.findByToken).mockResolvedValue(expiredInvitation);

    const service = new DefaultInvitationService(repository, emailService, {
      appUrl: 'http://localhost:3000',
    });

    await expect(
      service.validateToken(expiredInvitation.token),
    ).rejects.toBeInstanceOf(InvitationExpiredError);
    expect(repository.markExpired).toHaveBeenCalledWith(expiredInvitation.id);
  });
});
