import { describe, expect, it } from 'vitest';

import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_DEFAULTS,
  AUDIT_RETENTION_DAYS_MAX,
  AUDIT_RETENTION_DAYS_MIN,
  getAuditCategoryDefault,
  isAuditCategory,
} from './category';

describe('audit category taxonomy', () => {
  it('every category has a default entry within the allowed retention bounds', () => {
    for (const category of AUDIT_CATEGORIES) {
      const def = AUDIT_CATEGORY_DEFAULTS[category];
      expect(def).toBeDefined();
      expect(def.retentionDays).toBeGreaterThanOrEqual(
        AUDIT_RETENTION_DAYS_MIN,
      );
      expect(def.retentionDays).toBeLessThanOrEqual(AUDIT_RETENTION_DAYS_MAX);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('security_event and rbac_policy default to enabled (compliance-critical)', () => {
    expect(AUDIT_CATEGORY_DEFAULTS.security_event.enabled).toBe(true);
    expect(AUDIT_CATEGORY_DEFAULTS.rbac_policy.enabled).toBe(true);
  });

  it('waitlist defaults to disabled (low-value, DB-space conscious default)', () => {
    expect(AUDIT_CATEGORY_DEFAULTS.waitlist.enabled).toBe(false);
  });

  it('no category captures full input on success by default', () => {
    for (const category of AUDIT_CATEGORIES) {
      expect(AUDIT_CATEGORY_DEFAULTS[category].captureInputOnSuccess).toBe(
        false,
      );
    }
  });

  it('isAuditCategory narrows valid taxonomy values and rejects unknown strings', () => {
    expect(isAuditCategory('auth')).toBe(true);
    expect(isAuditCategory('not-a-real-category')).toBe(false);
  });

  it('getAuditCategoryDefault returns the same object as the defaults map', () => {
    expect(getAuditCategoryDefault('billing')).toBe(
      AUDIT_CATEGORY_DEFAULTS.billing,
    );
  });
});
