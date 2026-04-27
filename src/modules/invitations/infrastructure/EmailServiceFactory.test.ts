import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmailService } from './EmailServiceFactory';
import { NoOpEmailService } from './NoOpEmailService';

describe('createEmailService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns NoOpEmailService for provider=none', () => {
    const service = createEmailService({ provider: 'none' });
    expect(service).toBeInstanceOf(NoOpEmailService);
  });

  it('returns NoOpEmailService as default fallback for unknown provider', () => {
    // @ts-expect-error testing runtime fallback
    const service = createEmailService({ provider: 'unknown' });
    expect(service).toBeInstanceOf(NoOpEmailService);
  });

  it('throws for provider=none in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => createEmailService({ provider: 'none' })).toThrow(
      'EMAIL_PROVIDER=none is not allowed in production',
    );
  });

  it('throws for unknown provider in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() =>
      createEmailService({
        // @ts-expect-error testing runtime fallback
        provider: 'unknown',
      }),
    ).toThrow('Unknown EMAIL_PROVIDER');
  });

  it('returns service with correct interface for provider=resend', () => {
    const service = createEmailService({
      provider: 'resend',
      resendApiKey: 're_testkey123',
      resendFromEmail: 'noreply@example.com',
    });
    expect(typeof service.sendVerificationEmail).toBe('function');
    expect(typeof service.sendInvitationEmail).toBe('function');
  });

  it('throws when provider=resend but RESEND_API_KEY missing', () => {
    expect(() =>
      createEmailService({
        provider: 'resend',
        resendFromEmail: 'noreply@example.com',
      }),
    ).toThrow('RESEND_API_KEY');
  });

  it('throws when provider=resend but RESEND_FROM_EMAIL missing', () => {
    expect(() =>
      createEmailService({ provider: 'resend', resendApiKey: 're_key' }),
    ).toThrow('RESEND_FROM_EMAIL');
  });

  it('returns service with correct interface for provider=smtp', () => {
    const service = createEmailService({
      provider: 'smtp',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'user@gmail.com',
      smtpPass: 'app-password',
      smtpFromEmail: 'user@gmail.com',
    });
    expect(typeof service.sendVerificationEmail).toBe('function');
    expect(typeof service.sendInvitationEmail).toBe('function');
  });

  it('throws when provider=smtp but SMTP_HOST missing', () => {
    expect(() =>
      createEmailService({
        provider: 'smtp',
        smtpUser: 'u',
        smtpPass: 'p',
        smtpFromEmail: 'f@f.com',
      }),
    ).toThrow('SMTP_HOST');
  });

  it('throws when provider=smtp but SMTP_USER missing', () => {
    expect(() =>
      createEmailService({
        provider: 'smtp',
        smtpHost: 'smtp.gmail.com',
        smtpPass: 'p',
        smtpFromEmail: 'f@f.com',
      }),
    ).toThrow('SMTP_USER');
  });

  it('throws when provider=smtp but SMTP_PASS missing', () => {
    expect(() =>
      createEmailService({
        provider: 'smtp',
        smtpHost: 'smtp.gmail.com',
        smtpUser: 'u',
        smtpFromEmail: 'f@f.com',
      }),
    ).toThrow('SMTP_PASS');
  });

  it('throws when provider=smtp but SMTP_FROM_EMAIL missing', () => {
    expect(() =>
      createEmailService({
        provider: 'smtp',
        smtpHost: 'smtp.gmail.com',
        smtpUser: 'u',
        smtpPass: 'p',
      }),
    ).toThrow('SMTP_FROM_EMAIL');
  });
});
