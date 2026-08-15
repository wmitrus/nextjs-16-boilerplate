import { describe, expect, it } from 'vitest';

import { evaluateTenantReadiness } from './validate-tenant-readiness';

describe('evaluateTenantReadiness', () => {
  it('accepts a single-tenant database aligned with DEFAULT_TENANT_ID', () => {
    expect(
      evaluateTenantReadiness({
        tenancyMode: 'single',
        defaultTenantId: '10000000-0000-4000-8000-000000000001',
        tenantCount: 1,
        matchingTenantCount: 1,
        matchingOrganizationCount: 1,
      }),
    ).toMatchObject({ status: 'ready' });
  });

  it('blocks when DEFAULT_TENANT_ID differs from existing tenant data', () => {
    const result = evaluateTenantReadiness({
      tenancyMode: 'single',
      defaultTenantId: '20000000-0000-4000-8000-000000000002',
      tenantCount: 1,
      matchingTenantCount: 0,
      matchingOrganizationCount: 0,
    });

    expect(result).toMatchObject({ status: 'blocked' });
    expect(result.message).toContain('Align DEFAULT_TENANT_ID');
    expect(result.message).toContain('do not create a duplicate tenant');
  });

  it('directs an empty database to the one-time bootstrap', () => {
    const result = evaluateTenantReadiness({
      tenancyMode: 'single',
      defaultTenantId: '10000000-0000-4000-8000-000000000001',
      tenantCount: 0,
      matchingTenantCount: 0,
      matchingOrganizationCount: 0,
    });

    expect(result).toMatchObject({ status: 'blocked' });
    expect(result.message).toContain('one-time admin bootstrap');
  });

  it('blocks a tenant without an organization', () => {
    expect(
      evaluateTenantReadiness({
        tenancyMode: 'single',
        defaultTenantId: '10000000-0000-4000-8000-000000000001',
        tenantCount: 1,
        matchingTenantCount: 1,
        matchingOrganizationCount: 0,
      }),
    ).toMatchObject({ status: 'blocked' });
  });

  it('skips modes whose tenant lifecycle is request-driven', () => {
    expect(
      evaluateTenantReadiness({
        tenancyMode: 'personal',
        tenantCount: 0,
        matchingTenantCount: 0,
        matchingOrganizationCount: 0,
      }),
    ).toMatchObject({ status: 'skipped' });
  });

  it('blocks a missing tenancy mode instead of failing open', () => {
    expect(
      evaluateTenantReadiness({
        tenantCount: 0,
        matchingTenantCount: 0,
        matchingOrganizationCount: 0,
      }),
    ).toMatchObject({ status: 'blocked' });
  });
});
