import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { id: 'email-id-123' }, error: null }),
);

const mockResendClient = vi.hoisted(() => ({
  emails: { send: mockSend },
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return mockResendClient;
  }),
}));

import { ResendEmailService } from './ResendEmailService';

describe('ResendEmailService', () => {
  let service: ResendEmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ResendEmailService({
      apiKey: 're_test_key',
      fromEmail: 'noreply@example.com',
    });
  });

  describe('sendVerificationEmail', () => {
    it('calls resend emails.send with correct from/to/subject', async () => {
      await service.sendVerificationEmail({
        to: 'user@example.com',
        verifyUrl: 'https://example.com/auth/verify-email?token=abc',
      });
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@example.com',
          to: 'user@example.com',
          subject: 'Verify your email address',
          html: expect.stringContaining(
            'https://example.com/auth/verify-email?token=abc',
          ),
        }),
      );
    });

    it('escapes verification URLs before rendering html', async () => {
      await service.sendVerificationEmail({
        to: 'user@example.com',
        verifyUrl: 'https://example.com/auth/verify-email?token=<abc>',
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('%3Cabc%3E'),
        }),
      );
    });
  });

  describe('sendInvitationEmail', () => {
    it('calls resend emails.send with org name and invite url', async () => {
      await service.sendInvitationEmail({
        to: 'invitee@example.com',
        organizationName: 'Acme Corp',
        invitedByName: 'Alice',
        inviteUrl: 'https://example.com/invite/xyz',
        expiresAt: new Date('2026-12-31'),
      });
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@example.com',
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
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Someone'),
        }),
      );
    });

    it('escapes user-controlled html and formats dates deterministically', async () => {
      await service.sendInvitationEmail({
        to: 'invitee@example.com',
        organizationName: 'Acme <Admin>',
        invitedByName: 'Alice <script>',
        inviteUrl: 'https://example.com/invite/<token>',
        expiresAt: new Date('2026-12-31T12:00:00.000Z'),
      });

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "You've been invited to join Acme <Admin>",
          html: expect.stringContaining('Acme &lt;Admin&gt;'),
        }),
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Alice &lt;script&gt;'),
        }),
      );
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('2026-12-31'),
        }),
      );
    });
  });
});
