import { describe, expect, it } from 'vitest';

import {
  memberPolicies,
  ownerPolicies,
  POLICY_TEMPLATE_VERSION,
} from './templates';

describe('Policy templates', () => {
  const allPolicies = [...ownerPolicies, ...memberPolicies];

  it('POLICY_TEMPLATE_VERSION is a positive integer', () => {
    expect(typeof POLICY_TEMPLATE_VERSION).toBe('number');
    expect(Number.isInteger(POLICY_TEMPLATE_VERSION)).toBe(true);
    expect(POLICY_TEMPLATE_VERSION).toBeGreaterThan(0);
  });

  it('no template has a wildcard resource', () => {
    const wildcardResource = allPolicies.find((p) => p.resource === '*');
    expect(wildcardResource).toBeUndefined();
  });

  it('no template has wildcard actions', () => {
    const wildcardActions = allPolicies.find(
      (p) => p.actions.length === 1 && p.actions[0] === '*',
    );
    expect(wildcardActions).toBeUndefined();
  });

  it('no template has an empty actions array', () => {
    const emptyActions = allPolicies.find((p) => p.actions.length === 0);
    expect(emptyActions).toBeUndefined();
  });

  it('all templates have effect=allow', () => {
    const nonAllow = allPolicies.find((p) => p.effect !== 'allow');
    expect(nonAllow).toBeUndefined();
  });

  it('ownerPolicies: contains at least one policy per required resource', () => {
    const resources = ownerPolicies.map((p) => p.resource);
    expect(resources).toContain('route');
    expect(resources).toContain('user');
    expect(resources).toContain('tenant');
    expect(resources).toContain('billing');
    expect(resources).toContain('security');
  });

  it('memberPolicies: user:read and user:update have self-access conditions', () => {
    const userReadPolicies = memberPolicies.filter(
      (p) => p.resource === 'user' && p.actions.includes('user:read'),
    );
    expect(userReadPolicies.length).toBeGreaterThan(0);
    userReadPolicies.forEach((p) => {
      expect(p.conditions).toBeDefined();
    });

    const userUpdatePolicies = memberPolicies.filter(
      (p) => p.resource === 'user' && p.actions.includes('user:update'),
    );
    expect(userUpdatePolicies.length).toBeGreaterThan(0);
    userUpdatePolicies.forEach((p) => {
      expect(p.conditions).toBeDefined();
    });
  });

  it('memberPolicies: does not grant security or tenant management actions', () => {
    const securityPolicy = memberPolicies.find(
      (p) => p.resource === 'security',
    );
    expect(securityPolicy).toBeUndefined();

    const manageMembersPolicy = memberPolicies.find((p) =>
      p.actions.includes('tenant:manage_members'),
    );
    expect(manageMembersPolicy).toBeUndefined();

    const invitePolicy = memberPolicies.find((p) =>
      p.actions.includes('user:invite'),
    );
    expect(invitePolicy).toBeUndefined();
  });
});
