import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMail = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ messageId: 'msg-123' }),
);

const mockTransporter = vi.hoisted(() => ({
  sendMail: mockSendMail,
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue(mockTransporter),
  },
}));

import { NodemailerEmailService } from './NodemailerEmailService';

describe('NodemailerEmailService', () => {
  let service: NodemailerEmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NodemailerEmailService({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'test@gmail.com',
      pass: 'app-password',
      fromEmail: 'test@gmail.com',
    });
  });

  describe('sendVerificationEmail', () => {
    it('calls sendMail with correct from/to/subject and verify URL in html', async () => {
      await service.sendVerificationEmail({
        to: 'user@example.com',
        verifyUrl: 'https://example.com/auth/verify-email?token=abc',
      });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'test@gmail.com',
          to: 'user@example.com',
          subject: 'Verify your email address',
          html: expect.stringContaining(
            'https://example.com/auth/verify-email?token=abc',
          ),
        }),
      );
    });
  });

  describe('sendInvitationEmail', () => {
    it('calls sendMail with org name and invite url', async () => {
      await service.sendInvitationEmail({
        to: 'invitee@example.com',
        organizationName: 'Acme Corp',
        invitedByName: 'Bob',
        inviteUrl: 'https://example.com/invite/xyz',
        expiresAt: new Date('2026-12-31'),
      });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'test@gmail.com',
          to: 'invitee@example.com',
          subject: "You've been invited to join Acme Corp",
          html: expect.stringContaining('https://example.com/invite/xyz'),
        }),
      );
    });

    it('uses "Someone" when invitedByName is null', async () => {
      await service.sendInvitationEmail({
        to: 'invitee@example.com',
        organizationName: 'Acme Corp',
        invitedByName: null,
        inviteUrl: 'https://example.com/invite/xyz',
        expiresAt: new Date('2026-12-31'),
      });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Someone'),
        }),
      );
    });
  });
});
