import { describe, expect, it } from 'vitest';

import {
  internalOrganizationIdFromOrgRow,
  internalUserIdFromUsersRow,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';
import type { FeatureFlagEvaluationContext } from '@/core/contracts/feature-flags';

import {
  StaticFeatureFlagService,
  parseStaticFlagsEnv,
} from './StaticFeatureFlagService';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const TENANT_A = '22222222-2222-2222-2222-222222222222';
const USER_1 = '33333333-3333-3333-3333-333333333333';

const ctx: FeatureFlagEvaluationContext = {
  scope: {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(ORG_A),
    tenantId: parentTenantIdFromOrgRow(TENANT_A),
  },
  subject: { kind: 'user', userId: internalUserIdFromUsersRow(USER_1) },
};

describe('parseStaticFlagsEnv', () => {
  it('returns empty object for undefined input', () => {
    expect(parseStaticFlagsEnv(undefined)).toEqual({});
  });

  it('returns empty object for empty string', () => {
    expect(parseStaticFlagsEnv('')).toEqual({});
  });

  it('parses a single true flag', () => {
    expect(parseStaticFlagsEnv('new-ui=true')).toEqual({ 'new-ui': true });
  });

  it('parses a single false flag', () => {
    expect(parseStaticFlagsEnv('new-ui=false')).toEqual({ 'new-ui': false });
  });

  it('parses multiple flags', () => {
    expect(parseStaticFlagsEnv('a=true,b=false,c=true')).toEqual({
      a: true,
      b: false,
      c: true,
    });
  });

  it('treats non-"true" values as false', () => {
    expect(parseStaticFlagsEnv('flag=yes')).toEqual({ flag: false });
    expect(parseStaticFlagsEnv('flag=1')).toEqual({ flag: false });
    expect(parseStaticFlagsEnv('flag=TRUE')).toEqual({ flag: false });
  });

  it('skips malformed pairs with no equals sign', () => {
    expect(parseStaticFlagsEnv('good=true,badpair,other=false')).toEqual({
      good: true,
      other: false,
    });
  });

  it('skips pairs with empty key', () => {
    expect(parseStaticFlagsEnv('=true,valid=true')).toEqual({ valid: true });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseStaticFlagsEnv(' flag = true ')).toEqual({ flag: true });
  });
});

describe('StaticFeatureFlagService', () => {
  it('returns false for all flags when initialized with no flags', async () => {
    const svc = new StaticFeatureFlagService();

    expect(await svc.isEnabled('any-flag', ctx)).toBe(false);
  });

  it('returns true for a flag set to true', async () => {
    const svc = new StaticFeatureFlagService({ 'new-ui': true });

    expect(await svc.isEnabled('new-ui', ctx)).toBe(true);
  });

  it('returns false for a flag explicitly set to false', async () => {
    const svc = new StaticFeatureFlagService({ 'new-ui': false });

    expect(await svc.isEnabled('new-ui', ctx)).toBe(false);
  });

  it('returns false for an unknown flag key', async () => {
    const svc = new StaticFeatureFlagService({ known: true });

    expect(await svc.isEnabled('unknown', ctx)).toBe(false);
  });

  it('ignores the FeatureFlagEvaluationContext (flags are global)', async () => {
    const svc = new StaticFeatureFlagService({ flag: true });
    const otherCtx: FeatureFlagEvaluationContext = {
      scope: { kind: 'platform-global' },
      subject: { kind: 'system', systemSubjectId: 'other-caller' },
    };

    expect(await svc.isEnabled('flag', ctx)).toBe(true);
    expect(await svc.isEnabled('flag', otherCtx)).toBe(true);
  });
});
