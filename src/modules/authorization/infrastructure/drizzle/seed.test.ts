import { describe, expect, it } from 'vitest';

import { POLICIES, ROLES } from './seed';

import { ownerPolicies } from '@/modules/provisioning/policy/templates';

/**
 * OZI-220. The seed stamps every tenant with the current
 * `POLICY_TEMPLATE_VERSION`, so provisioning reconciliation treats seeded
 * owners as up to date and never adds an action the template gained later.
 * The seed therefore has to grant the template's owner actions itself: when
 * `security:manage_audit_settings` was added only to the template, every
 * seeded owner (including the E2E admin) got 403 on audit-settings PATCH.
 */
describe('seeded owner policies', () => {
  it.each([
    ['acme', ROLES.acmeOwner.id],
    ['globex', ROLES.globexOwner.id],
  ])('%s owner grants every action of the owner template', (_org, roleId) => {
    for (const template of ownerPolicies) {
      const granted = POLICIES.filter(
        (p) => p.roleId === roleId && p.resource === template.resource,
      ).flatMap((p) => p.actions as readonly string[]);
      expect(granted, template.resource).toEqual(
        expect.arrayContaining(template.actions),
      );
    }
  });
});
