import { describe, expect, it } from 'vitest';

import type { SqlRunner } from './post-migrate-steps';
import {
  assertS7ProductionPreconditions,
  gatherS7ProductionEvidence,
  S7_PRODUCTION_APPROVAL_FLAG,
  type S7ProductionEvidence,
} from './s7-production-gate';

function runnerWithRows(...rows: unknown[]): SqlRunner {
  let call = 0;

  return {
    query: async <T>() => {
      const row = rows[call++];
      return row === undefined ? [] : [row as T];
    },
  };
}

const canonical: S7ProductionEvidence = {
  preS7Schema: false,
  waitlistTenantIdExists: false,
  waitlistRowsWithTenantId: 0,
  policiesNullOrganizationId: 0,
  policiesOrganizationIdNullable: false,
  policiesHelperCheckExists: false,
};

describe('gatherS7ProductionEvidence', () => {
  it('recognizes a pre-0008 schema and allows migrations to bootstrap forward', async () => {
    const runner = runnerWithRows({
      policies_table_exists: true,
      policies_tenant_id_exists: true,
      policies_organization_id_exists: false,
      waitlist_tenant_id_exists: false,
      policies_is_nullable: null,
      policies_helper_check_exists: false,
      organizations_table_exists: false,
      waitlist_table_exists: false,
    });

    await expect(gatherS7ProductionEvidence(runner)).resolves.toEqual({
      preS7Schema: true,
      waitlistTenantIdExists: false,
      waitlistRowsWithTenantId: 0,
      policiesNullOrganizationId: 0,
      policiesOrganizationIdNullable: false,
      policiesHelperCheckExists: false,
    });
  });

  it('recognizes a completely fresh database as pre-S7', async () => {
    const runner = runnerWithRows({
      policies_table_exists: false,
      policies_tenant_id_exists: false,
      policies_organization_id_exists: false,
      waitlist_tenant_id_exists: false,
      policies_is_nullable: null,
      policies_helper_check_exists: false,
      organizations_table_exists: false,
      waitlist_table_exists: false,
    });

    const evidence = await gatherS7ProductionEvidence(runner);

    expect(evidence.preS7Schema).toBe(true);
  });

  it('fails closed when policies is missing but 0008+ schema artifacts remain', async () => {
    const runner = runnerWithRows({
      policies_table_exists: false,
      policies_tenant_id_exists: false,
      policies_organization_id_exists: false,
      waitlist_tenant_id_exists: false,
      policies_is_nullable: null,
      policies_helper_check_exists: false,
      organizations_table_exists: true,
      waitlist_table_exists: true,
    });

    await expect(gatherS7ProductionEvidence(runner)).rejects.toThrow(
      /unknown schema drift/i,
    );
  });

  it('fails closed when organization_id was renamed back on a 0008+ schema', async () => {
    const runner = runnerWithRows({
      policies_table_exists: true,
      policies_tenant_id_exists: true,
      policies_organization_id_exists: false,
      waitlist_tenant_id_exists: false,
      policies_is_nullable: null,
      policies_helper_check_exists: false,
      organizations_table_exists: true,
      waitlist_table_exists: true,
    });

    await expect(gatherS7ProductionEvidence(runner)).rejects.toThrow(
      /unknown schema drift/i,
    );
  });

  it('fails closed when organization_id is missing from an unrecognized schema', async () => {
    const runner = runnerWithRows({
      policies_table_exists: true,
      policies_tenant_id_exists: false,
      policies_organization_id_exists: false,
      waitlist_tenant_id_exists: false,
      policies_is_nullable: null,
      policies_helper_check_exists: false,
      organizations_table_exists: false,
      waitlist_table_exists: false,
    });

    await expect(gatherS7ProductionEvidence(runner)).rejects.toThrow(
      /unknown schema drift/i,
    );
  });
});

describe('assertS7ProductionPreconditions', () => {
  it('allows a recognized pre-S7 schema to advance without S7 approval', () => {
    expect(() =>
      assertS7ProductionPreconditions(
        {
          ...canonical,
          preS7Schema: true,
        },
        {
          approved: false,
          preview: false,
        },
      ),
    ).not.toThrow();
  });

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
