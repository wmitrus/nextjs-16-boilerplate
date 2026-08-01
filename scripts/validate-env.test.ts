// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/env', async () => {
  const realModule = (await vi.importActual('@/core/env')) as Record<
    string,
    unknown
  >;
  return {
    ...realModule,
  };
});

import { runValidation } from './validate-env';

const VALID_UUID =
  'f47ac10b-58cc-4372-a567-0e02b2c3d479'; /* RFC 4122 v4 UUID */

describe('validate-env: runValidation', () => {
  describe('auth provider validation', () => {
    it('returns no errors when AUTH_PROVIDER=clerk with both keys set', () => {
      const errors = runValidation(
        'clerk',
        'sk_test_secret',
        'pk_test_public',
        undefined,
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(0);
    });

    it('returns error when AUTH_PROVIDER=clerk without CLERK_SECRET_KEY', () => {
      const errors = runValidation(
        'clerk',
        undefined,
        'pk_test_public',
        undefined,
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('CLERK_SECRET_KEY');
    });

    it('returns error when AUTH_PROVIDER=clerk without NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', () => {
      const errors = runValidation(
        'clerk',
        'sk_test_secret',
        undefined,
        undefined,
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    });

    it('returns no auth errors when AUTH_PROVIDER=authjs outside production without NEXTAUTH_SECRET or NEXTAUTH_URL', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        undefined,
        'personal',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(0);
    });

    it('returns an auth error when AUTH_PROVIDER=authjs in production without NEXTAUTH_SECRET', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        undefined,
        'personal',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        undefined,
        undefined,
        { nextAuthUrl: 'https://example.com' },
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NEXTAUTH_SECRET');
    });

    it('returns no auth errors when AUTH_PROVIDER=authjs in preview has no static NEXTAUTH_URL', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        'preview',
      );
      expect(errors).toHaveLength(0);
    });

    it('returns an auth error when AUTH_PROVIDER=authjs in production prebuilt deploy has NEXTAUTH_SECRET but no runtime NEXTAUTH_URL', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        'production',
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NEXTAUTH_URL');
      expect(errors[0]).toContain('production runtime');
    });

    it('returns no auth errors when AUTH_PROVIDER=authjs in production with NEXTAUTH_SECRET and NEXTAUTH_URL', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        'production',
        undefined,
        { nextAuthUrl: 'https://example.com' },
      );
      expect(errors).toHaveLength(0);
    });

    it('returns an auth error when Vercel production env lacks NEXTAUTH_URL even if a local value exists', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        'production',
        new Set(['AUTH_PROVIDER', 'TENANCY_MODE', 'NEXTAUTH_SECRET']),
        { nextAuthUrl: 'https://local.example.com' },
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('.vercel/.env.production.local');
      expect(errors[0]).toContain('NEXTAUTH_URL');
    });

    it('returns an auth error when AUTH_PROVIDER=authjs in production has only an empty runtime URL', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        'production',
        undefined,
        { nextAuthUrl: '' },
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NEXTAUTH_URL');
      expect(errors[0]).toContain('production runtime');
    });
  });

  describe('tenancy validation', () => {
    it('returns error when TENANCY_MODE=single without DEFAULT_TENANT_ID', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        undefined,
        'single',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('DEFAULT_TENANT_ID');
    });

    it('returns no errors when TENANCY_MODE=single with DEFAULT_TENANT_ID', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        undefined,
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(0);
    });

    it('returns error when TENANCY_MODE=org without TENANT_CONTEXT_SOURCE', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        undefined,
        'org',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('TENANT_CONTEXT_SOURCE');
    });

    it('returns no errors when TENANCY_MODE=org with TENANT_CONTEXT_SOURCE', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        undefined,
        'org',
        undefined,
        'provider',
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('combined validation', () => {
    it('requires explicit provider and tenancy mode for preview deployments', () => {
      const errors = runValidation(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        VALID_UUID,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        'preview',
      );

      expect(errors.some((e) => e.includes('AUTH_PROVIDER'))).toBe(true);
      expect(errors.some((e) => e.includes('TENANCY_MODE'))).toBe(true);
    });

    it('requires production-like deployment keys to come from the Vercel-pulled env file', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        'preview',
        new Set(['AUTH_PROVIDER']),
        { nextAuthUrl: 'https://preview.example.com' },
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('TENANCY_MODE');
      expect(errors[0]).toContain('.vercel/.env.preview.local');
    });

    it('accepts a redacted sensitive AuthJS secret when the Vercel-pulled preview env contains the key', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        '',
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
        undefined,
        'production',
        'preview',
        new Set(['AUTH_PROVIDER', 'TENANCY_MODE', 'NEXTAUTH_SECRET']),
        { nextAuthUrl: 'https://preview.example.com' },
      );

      expect(errors).toHaveLength(0);
    });

    it('accumulates multiple errors when both auth and tenancy requirements fail', () => {
      const errors = runValidation(
        'clerk',
        undefined,
        undefined,
        undefined,
        'single',
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        'test',
      );
      expect(errors).toHaveLength(2);
      expect(errors.some((e) => e.includes('CLERK_SECRET_KEY'))).toBe(true);
      expect(errors.some((e) => e.includes('DEFAULT_TENANT_ID'))).toBe(true);
    });
  });

  describe('new relic validation', () => {
    it('returns an error when NEW_RELIC_ENABLED=true without NEW_RELIC_LICENSE_KEY', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        'true',
        undefined,
        undefined,
        'production',
        undefined,
        undefined,
        { nextAuthUrl: 'https://example.com' },
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NEW_RELIC_LICENSE_KEY');
    });

    it('returns no error when NEW_RELIC_ENABLED=true with NEW_RELIC_LICENSE_KEY', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        'true',
        'nr_license_key',
        undefined,
        'production',
        undefined,
        undefined,
        { nextAuthUrl: 'https://example.com' },
      );

      expect(errors).toHaveLength(0);
    });

    it('returns an error when NEW_RELIC_LICENSE_KEY is whitespace only', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        'true',
        '   ',
        undefined,
        'production',
        undefined,
        undefined,
        { nextAuthUrl: 'https://example.com' },
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NEW_RELIC_LICENSE_KEY');
    });

    it('rejects New Relic preload when validating a Vercel deployment', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'nextauth_secret',
        'personal',
        undefined,
        undefined,
        true,
        'nr_license_key',
        '-r newrelic',
        'production',
        'production',
        undefined,
        { nextAuthUrl: 'https://example.com' },
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NODE_OPTIONS');
      expect(errors[0]).toContain('newrelic');
    });
  });
});
