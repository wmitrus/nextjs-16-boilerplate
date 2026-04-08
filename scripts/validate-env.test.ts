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
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
      );
      expect(errors).toHaveLength(0);
    });

    it('returns error when AUTH_PROVIDER=clerk without CLERK_SECRET_KEY', () => {
      const errors = runValidation(
        'clerk',
        undefined,
        'pk_test_public',
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('CLERK_SECRET_KEY');
    });

    it('returns error when AUTH_PROVIDER=clerk without NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', () => {
      const errors = runValidation(
        'clerk',
        'sk_test_secret',
        undefined,
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    });

    it('returns no auth errors when AUTH_PROVIDER is not clerk', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'personal',
        undefined,
        undefined,
        false,
        undefined,
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('tenancy validation', () => {
    it('returns error when TENANCY_MODE=single without DEFAULT_TENANT_ID', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'single',
        undefined,
        undefined,
        false,
        undefined,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('DEFAULT_TENANT_ID');
    });

    it('returns no errors when TENANCY_MODE=single with DEFAULT_TENANT_ID', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'single',
        VALID_UUID,
        undefined,
        false,
        undefined,
      );
      expect(errors).toHaveLength(0);
    });

    it('returns error when TENANCY_MODE=org without TENANT_CONTEXT_SOURCE', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'org',
        undefined,
        undefined,
        false,
        undefined,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('TENANT_CONTEXT_SOURCE');
    });

    it('returns no errors when TENANCY_MODE=org with TENANT_CONTEXT_SOURCE', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'org',
        undefined,
        'provider',
        false,
        undefined,
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('combined validation', () => {
    it('accumulates multiple errors when both auth and tenancy requirements fail', () => {
      const errors = runValidation(
        'clerk',
        undefined,
        undefined,
        'single',
        undefined,
        undefined,
        false,
        undefined,
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
        'personal',
        undefined,
        undefined,
        'true',
        undefined,
      );

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('NEW_RELIC_LICENSE_KEY');
    });

    it('returns no error when NEW_RELIC_ENABLED=true with NEW_RELIC_LICENSE_KEY', () => {
      const errors = runValidation(
        'authjs',
        undefined,
        undefined,
        'personal',
        undefined,
        undefined,
        'true',
        'nr_license_key',
      );

      expect(errors).toHaveLength(0);
    });
  });
});
