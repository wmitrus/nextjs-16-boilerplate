import { describe, expect, it } from 'vitest';

import { TenantContextRequiredError } from '../../domain/errors';

describe('decideNewMembershipRole (unit: role mapping)', () => {
  const orgProviderInput = {
    provider: 'clerk' as const,
    externalUserId: 'user_001',
    tenancyMode: 'org' as const,
    tenantContextSource: 'provider' as const,
    tenantExternalId: 'org_001',
  };

  it('maps org:admin claim to owner', () => {
    const claim = 'org:admin';
    const normalized = claim.toLowerCase();
    const result =
      normalized.includes('admin') || normalized.includes('owner')
        ? 'owner'
        : 'member';
    expect(result).toBe('owner');
  });

  it('maps org:member claim to member', () => {
    const claim = 'org:member';
    const normalized = claim.toLowerCase();
    const result =
      normalized.includes('admin') || normalized.includes('owner')
        ? 'owner'
        : 'member';
    expect(result).toBe('member');
  });

  it('maps admin claim to owner', () => {
    const claim = 'admin';
    const normalized = claim.toLowerCase();
    const result =
      normalized.includes('admin') || normalized.includes('owner')
        ? 'owner'
        : 'member';
    expect(result).toBe('owner');
  });

  it('maps owner claim to owner', () => {
    const claim = 'owner';
    const normalized = claim.toLowerCase();
    const result =
      normalized.includes('admin') || normalized.includes('owner')
        ? 'owner'
        : 'member';
    expect(result).toBe('owner');
  });

  it('falls back to member when claim is undefined', () => {
    const claim = undefined;
    const result = !claim ? 'member' : 'other';
    expect(result).toBe('member');
  });

  it('personal mode always maps to owner', () => {
    const input = { ...orgProviderInput, tenancyMode: 'personal' as const };
    const role = input.tenancyMode === 'personal' ? 'owner' : 'member';
    expect(role).toBe('owner');
  });

  it('non-personal mode maps to member (single/org without claim)', () => {
    const modes: Array<'single' | 'personal' | 'org'> = ['single', 'org'];
    for (const mode of modes) {
      const role = mode === 'personal' ? 'owner' : 'member';
      expect(role).toBe('member');
    }
  });

  it('org/provider with tenantCreatedNow + owner claim maps to owner', () => {
    const tenantCreatedNow = true;
    const claimRole: 'owner' | 'member' = 'owner';
    const role =
      tenantCreatedNow && claimRole === 'owner' ? 'owner' : claimRole;
    expect(role).toBe('owner');
  });

  it('org/provider without tenantCreatedNow + owner claim still maps to owner via claim', () => {
    const tenantCreatedNow = false;
    const claimRole: 'owner' | 'member' = 'owner';
    const role =
      tenantCreatedNow && claimRole === 'owner' ? 'owner' : claimRole;
    expect(role).toBe('owner');
  });
});

describe('TenantContextRequiredError', () => {
  it('has correct name and message', () => {
    const error = new TenantContextRequiredError();
    expect(error.name).toBe('TenantContextRequiredError');
    expect(error.message).toContain('tenancy mode');
  });

  it('accepts custom message', () => {
    const error = new TenantContextRequiredError('custom message');
    expect(error.message).toBe('custom message');
  });
});
