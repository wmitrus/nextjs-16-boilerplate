import { describe, expect, it } from 'vitest';

import {
  assertS7ProductionPreconditions,
  S7_PRODUCTION_APPROVAL_FLAG,
  type S7ProductionEvidence,
} from './s7-production-gate';

const canonical: S7ProductionEvidence = {
  waitlistTenantIdExists: false,
  waitlistRowsWithTenantId: 0,
  policiesNullOrganizationId: 0,
  policiesOrganizationIdNullable: false,
  policiesHelperCheckExists: false,
};

describe('assertS7ProductionPreconditions', () => {
  it('allows an already-converged schema without approval', () => {
    expect(() =>
      assertS7ProductionPreconditions(canonical, {
        approved: false,
        preview: false,
      }),
    ).not.toThrow();
  });

  it('requires explicit approval before the destructive journaled cutover', () => {
    const evidence: S7ProductionEvidence = {
      ...canonical,
      waitlistTenantIdExists: true,
      policiesOrganizationIdNullable: true,
    };

    expect(() =>
      assertS7ProductionPreconditions(evidence, {
        approved: false,
        preview: false,
      }),
    ).toThrow(S7_PRODUCTION_APPROVAL_FLAG);
  });

  it('allows the expected pre-0025 state with explicit approval', () => {
    const evidence: S7ProductionEvidence = {
      ...canonical,
      waitlistTenantIdExists: true,
      policiesOrganizationIdNullable: true,
    };

    expect(() =>
      assertS7ProductionPreconditions(evidence, {
        approved: true,
        preview: false,
      }),
    ).not.toThrow();
  });

  it('allows Preview to perform the isolated cutover without Production approval', () => {
    const evidence: S7ProductionEvidence = {
      ...canonical,
      waitlistTenantIdExists: true,
      policiesOrganizationIdNullable: true,
    };

    expect(() =>
      assertS7ProductionPreconditions(evidence, {
        approved: false,
        preview: true,
      }),
    ).not.toThrow();
  });

  it('fails closed if any waitlist row still carries tenant_id', () => {
    expect(() =>
      assertS7ProductionPreconditions(
        {
          ...canonical,
          waitlistTenantIdExists: true,
          waitlistRowsWithTenantId: 1,
          policiesOrganizationIdNullable: true,
        },
        { approved: true, preview: false },
      ),
    ).toThrow(/waitlist row/i);
  });

  it('fails closed if any policy still has NULL organization_id', () => {
    expect(() =>
      assertS7ProductionPreconditions(
        {
          ...canonical,
          policiesNullOrganizationId: 1,
          policiesOrganizationIdNullable: true,
        },
        { approved: true, preview: false },
      ),
    ).toThrow(/policy row/i);
  });

  it('requires approval for post-0025 convergence still pending', () => {
    const evidence: S7ProductionEvidence = {
      ...canonical,
      policiesOrganizationIdNullable: true,
      policiesHelperCheckExists: true,
    };

    expect(() =>
      assertS7ProductionPreconditions(evidence, {
        approved: false,
        preview: false,
      }),
    ).toThrow(S7_PRODUCTION_APPROVAL_FLAG);
  });

  it('fails closed on post-0025 nullable-policy drift without the helper CHECK', () => {
    const evidence: S7ProductionEvidence = {
      ...canonical,
      policiesOrganizationIdNullable: true,
      policiesHelperCheckExists: false,
    };

    expect(() =>
      assertS7ProductionPreconditions(evidence, {
        approved: true,
        preview: false,
      }),
    ).toThrow(/unknown schema drift/i);
  });
});
