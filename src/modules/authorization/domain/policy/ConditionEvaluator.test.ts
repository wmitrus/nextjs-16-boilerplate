import { describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/repositories';

import {
  hasAttribute,
  isAfterHour,
  isBeforeHour,
  isFromAllowedIp,
  isNotFromBlockedIp,
  isOwner,
} from './ConditionEvaluator';

const baseContext: AuthorizationContext = {
  tenant: { tenantId: 't1', userId: 'user_1' },
  subject: { id: 'user_1' },
  resource: { type: 'document', id: 'user_1' },
  action: 'document:read',
};

describe('ConditionEvaluator', () => {
  describe('isOwner', () => {
    it('returns true when subject.id matches resource.id', () => {
      expect(isOwner(baseContext)).toBe(true);
    });

    it('returns false when subject.id does not match resource.id', () => {
      expect(
        isOwner({
          ...baseContext,
          resource: { type: 'document', id: 'other_user' },
        }),
      ).toBe(false);
    });

    it('returns false when resource has no id', () => {
      expect(isOwner({ ...baseContext, resource: { type: 'document' } })).toBe(
        false,
      );
    });
  });

  describe('hasAttribute', () => {
    it('returns true when subject has the expected attribute value', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        subject: { id: 'user_1', attributes: { plan: 'pro' } },
      };
      expect(hasAttribute(ctx, 'plan', 'pro')).toBe(true);
    });

    it('returns false when subject attribute value differs', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        subject: { id: 'user_1', attributes: { plan: 'free' } },
      };
      expect(hasAttribute(ctx, 'plan', 'pro')).toBe(false);
    });

    it('returns false when subject has no attributes', () => {
      expect(hasAttribute(baseContext, 'plan', 'pro')).toBe(false);
    });
  });

  describe('isBeforeHour', () => {
    it('returns true when time is before the given UTC hour', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { time: new Date('2024-01-01T10:00:00Z') },
      };
      expect(isBeforeHour(ctx, 18)).toBe(true);
    });

    it('returns false when time equals the given UTC hour', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { time: new Date('2024-01-01T18:00:00Z') },
      };
      expect(isBeforeHour(ctx, 18)).toBe(false);
    });

    it('returns false when time is after the given UTC hour', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { time: new Date('2024-01-01T20:00:00Z') },
      };
      expect(isBeforeHour(ctx, 18)).toBe(false);
    });
  });

  describe('isAfterHour', () => {
    it('returns true when time is at or after the given UTC hour', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { time: new Date('2024-01-01T08:00:00Z') },
      };
      expect(isAfterHour(ctx, 8)).toBe(true);
    });

    it('returns false when time is before the given UTC hour', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { time: new Date('2024-01-01T07:59:00Z') },
      };
      expect(isAfterHour(ctx, 8)).toBe(false);
    });
  });

  describe('isFromAllowedIp', () => {
    it('returns true when IP is in the allow list', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { ip: '127.0.0.1' },
      };
      expect(isFromAllowedIp(ctx, ['127.0.0.1', '::1'])).toBe(true);
    });

    it('returns false when IP is not in the allow list', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { ip: '203.0.113.1' },
      };
      expect(isFromAllowedIp(ctx, ['127.0.0.1', '::1'])).toBe(false);
    });

    it('returns false when no IP is present', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { time: new Date() },
      };
      expect(isFromAllowedIp(ctx, ['127.0.0.1'])).toBe(false);
    });
  });

  describe('isNotFromBlockedIp', () => {
    it('returns true when IP is not in the block list', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { ip: '127.0.0.1' },
      };
      expect(isNotFromBlockedIp(ctx, ['10.0.0.1'])).toBe(true);
    });

    it('returns false when IP is in the block list', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { ip: '10.0.0.1' },
      };
      expect(isNotFromBlockedIp(ctx, ['10.0.0.1'])).toBe(false);
    });

    it('returns true when no IP is present (safe default)', () => {
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { time: new Date() },
      };
      expect(isNotFromBlockedIp(ctx, ['10.0.0.1'])).toBe(true);
    });
  });
});
