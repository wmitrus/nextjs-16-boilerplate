import { describe, expect, it } from 'vitest';

import type { AuthorizationContext } from '@/core/contracts/authorization';

import {
  StaticFeatureFlagService,
  parseStaticFlagsEnv,
} from './StaticFeatureFlagService';

const ctx: AuthorizationContext = {
  tenant: { tenantId: 't1' },
  subject: { id: 'u1' },
  resource: { type: 'doc' },
  action: 'doc:read',
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

  it('ignores the AuthorizationContext (flags are global)', async () => {
    const svc = new StaticFeatureFlagService({ flag: true });
    const otherCtx: AuthorizationContext = {
      tenant: { tenantId: 'different-tenant' },
      subject: { id: 'u2' },
      resource: { type: 'post' },
      action: 'post:write',
    };

    expect(await svc.isEnabled('flag', ctx)).toBe(true);
    expect(await svc.isEnabled('flag', otherCtx)).toBe(true);
  });
});
