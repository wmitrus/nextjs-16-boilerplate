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
import { mockChildLogger, resetAllInfrastructureMocks } from '@/testing';

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function buildInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    invitedByUserId: 'user-1',
    email: 'alice@example.com',
    roleId: 'role-1',
    token: 'invite-token',
    status: 'pending',
    expiresAt: daysFromNow(7),
    acceptedAt: null,
    createdAt: daysFromNow(-1),
    ...overrides,
  };
}

describe('DefaultInvitationService', () => {
  const repository: vi.Mocked<InvitationRepository> = {
    create: vi.fn(),
    findByToken: vi.fn(),
    findPendingByEmailAndOrg: vi.fn(),
    listByOrganization: vi.fn(),
    markAccepted: vi.fn(),
    markRevoked: vi.fn(),
    markExpired: vi.fn(),
  };

  const emailService: vi.Mocked<EmailService> = {
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
    repository.findByToken.mockResolvedValue(pendingInvitation);
    repository.markAccepted.mockResolvedValue(acceptedInvitation);

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
    repository.findByToken.mockResolvedValue(pendingInvitation);
    repository.markAccepted.mockResolvedValue(null);

    const service = new DefaultInvitationService(repository, emailService, {
      appUrl: 'http://localhost:3000',
    });

    await expect(
      service.acceptInvitation({ token: pendingInvitation.token }),
    ).rejects.toBeInstanceOf(InvitationAlreadyUsedError);
  });

  it('marks overdue pending invitations as expired during validation', async () => {
    const expiredInvitation = buildInvitation({
      expiresAt: daysFromNow(-30),
    });
    repository.findByToken.mockResolvedValue(expiredInvitation);

    const service = new DefaultInvitationService(repository, emailService, {
      appUrl: 'http://localhost:3000',
    });

    await expect(
      service.validateToken(expiredInvitation.token),
    ).rejects.toBeInstanceOf(InvitationExpiredError);
    expect(repository.markExpired).toHaveBeenCalledWith(expiredInvitation.id);
  });

  it('logs invitation lifecycle events without raw email addresses', async () => {
    const createdInvitation = buildInvitation();
    repository.findPendingByEmailAndOrg.mockResolvedValue(null);
    repository.create.mockResolvedValue(createdInvitation);
    emailService.sendInvitationEmail.mockResolvedValue(undefined);
    repository.findByToken.mockResolvedValue(createdInvitation);
    repository.markAccepted.mockResolvedValue(
      buildInvitation({ status: 'accepted', acceptedAt: new Date() }),
    );

    const service = new DefaultInvitationService(repository, emailService, {
      appUrl: 'http://localhost:3000',
    });

    await service.createInvitation({
      organizationId: createdInvitation.organizationId,
      invitedByUserId: createdInvitation.invitedByUserId ?? 'user-1',
      email: createdInvitation.email,
      roleId: createdInvitation.roleId,
      expiresInHours: 72,
    });
    await service.acceptInvitation({ token: createdInvitation.token });

    const createdLog = vi.mocked(mockChildLogger.info).mock.calls[0]?.[0];
    const acceptedLog = vi.mocked(mockChildLogger.info).mock.calls[1]?.[0];

    expect(createdLog).toHaveProperty('emailHash');
    expect(createdLog).not.toHaveProperty('email');
    expect(acceptedLog).toHaveProperty('emailHash');
    expect(acceptedLog).not.toHaveProperty('email');
  });

  it('logs email send failures without raw recipient addresses', async () => {
    const createdInvitation = buildInvitation();
    repository.findPendingByEmailAndOrg.mockResolvedValue(null);
    repository.create.mockResolvedValue(createdInvitation);
    emailService.sendInvitationEmail.mockRejectedValue(
      new Error('smtp unavailable'),
    );

    const service = new DefaultInvitationService(repository, emailService, {
      appUrl: 'http://localhost:3000',
    });

    await service.createInvitation({
      organizationId: createdInvitation.organizationId,
      invitedByUserId: createdInvitation.invitedByUserId ?? 'user-1',
      email: createdInvitation.email,
      roleId: createdInvitation.roleId,
      expiresInHours: 72,
    });

    const warnPayload = vi.mocked(mockChildLogger.warn).mock.calls[0]?.[0];
    expect(warnPayload).toHaveProperty('emailHash');
    expect(warnPayload).not.toHaveProperty('email');
  });
});
