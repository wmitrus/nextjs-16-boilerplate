import { describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';

import { deserializeCondition } from './deserializeCondition';

const baseContext: AuthorizationContext = {
  tenant: { tenantId: 't1' },
  subject: { id: 'u1', attributes: { plan: 'pro' } },
  resource: { type: 'document', id: 'u1' },
  action: 'document:read',
};

describe('deserializeCondition', () => {
  it('returns undefined for null input', () => {
    expect(deserializeCondition(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(deserializeCondition(undefined)).toBeUndefined();
  });

  it('returns undefined for unknown type', () => {
    const result = deserializeCondition({ type: 'unknown' });
    expect(result).toBeUndefined();
  });

  it('hasAttribute — returns true when attribute matches', () => {
    const condition = deserializeCondition({
      type: 'hasAttribute',
      key: 'plan',
      value: 'pro',
    });

    expect(condition?.(baseContext)).toBe(true);
  });

  it('hasAttribute — returns false when attribute does not match', () => {
    const condition = deserializeCondition({
      type: 'hasAttribute',
      key: 'plan',
      value: 'enterprise',
    });

    expect(condition?.(baseContext)).toBe(false);
  });

  it('isOwner — returns true when subject id matches resource id', () => {
    const condition = deserializeCondition({ type: 'isOwner' });

    expect(condition?.(baseContext)).toBe(true);
  });

  it('isFromAllowedIp — returns true when ip is in allowList', () => {
    const ctx: AuthorizationContext = {
      ...baseContext,
      environment: { ip: '10.0.0.1' },
    };
    const condition = deserializeCondition({
      type: 'isFromAllowedIp',
      ips: ['10.0.0.1', '10.0.0.2'],
    });

    expect(condition?.(ctx)).toBe(true);
  });

  it('isNotFromBlockedIp — returns false when ip is blocked', () => {
    const ctx: AuthorizationContext = {
      ...baseContext,
      environment: { ip: '1.2.3.4' },
    };
    const condition = deserializeCondition({
      type: 'isNotFromBlockedIp',
      ips: ['1.2.3.4'],
    });

    expect(condition?.(ctx)).toBe(false);
  });
});
