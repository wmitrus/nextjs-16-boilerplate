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
  tenant: { tenantId: 't1' },
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

    it('returns FALSE when no IP is present -- inverted by SEC-43', () => {
      // This asserted `true` and called it "safe default" until SEC-43. It
      // was safe only because the branch was unreachable: `getIP()` returned
      // '127.0.0.1' whenever it had nothing, so `environment.ip` was always
      // set. Once an unidentifiable client became a real state, "not blocked"
      // as the answer to "I don't know who you are" is a block-list bypass
      // available to anyone who arrives without a trustworthy header.
      const ctx: AuthorizationContext = {
        ...baseContext,
        environment: { time: new Date() },
      };
      expect(isNotFromBlockedIp(ctx, ['10.0.0.1'])).toBe(false);
    });
  });

  describe('SEC-43: an unidentifiable client', () => {
    // Before SEC-43, `getIP()` returned '127.0.0.1' whenever it had nothing,
    // so `environment.ip` was always set and these branches were unreachable.
    // Once "unknown client" became a real state they matter, and they must
    // fail in the safe direction.
    it('fails an allow-list condition', () => {
      expect(
        isFromAllowedIp({ ...baseContext, environment: { ip: undefined } }, [
          '203.0.113.1',
        ]),
      ).toBe(false);
    });

    it('fails a block-list condition rather than passing it', () => {
      // "I cannot tell whether you are blocked" is not "you are not blocked".
      // The old `true` here would have let anyone arriving without a
      // trustworthy header walk straight past an IP block-list.
      expect(
        isNotFromBlockedIp({ ...baseContext, environment: { ip: undefined } }, [
          '192.168.1.100',
        ]),
      ).toBe(false);
    });

    it('still allows a non-blocked, identified client', () => {
      expect(
        isNotFromBlockedIp(
          { ...baseContext, environment: { ip: '203.0.113.1' } },
          ['192.168.1.100'],
        ),
      ).toBe(true);
    });
  });
});
