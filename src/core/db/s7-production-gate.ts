import type { SqlRunner } from './post-migrate-steps';

export const S7_PRODUCTION_APPROVAL_FLAG = '--s7-destructive-approved';
export const S7_POLICIES_CHECK_NAME = 'policies_organization_id_not_null';

export interface S7ProductionEvidence {
  readonly waitlistTenantIdExists: boolean;
  readonly waitlistRowsWithTenantId: number;
  readonly policiesNullOrganizationId: number;
  readonly policiesOrganizationIdNullable: boolean;
  readonly policiesHelperCheckExists: boolean;
}

function toCount(value: unknown, label: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`[s7-production-gate] invalid ${label} count`);
  }

  return parsed;
}

export async function gatherS7ProductionEvidence(
  runner: SqlRunner,
): Promise<S7ProductionEvidence> {
  const columnRows = await runner.query<{
    waitlist_tenant_id_exists: boolean;
    policies_is_nullable: 'YES' | 'NO';
    policies_helper_check_exists: boolean;
  }>(
    `SELECT
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'waitlist_entries'
            AND column_name = 'tenant_id'
       ) AS waitlist_tenant_id_exists,
       (
         SELECT is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'policies'
            AND column_name = 'organization_id'
       ) AS policies_is_nullable,
       EXISTS (
         SELECT 1
           FROM pg_constraint c
           JOIN pg_class rel ON rel.oid = c.conrelid
           JOIN pg_namespace ns ON ns.oid = rel.relnamespace
          WHERE ns.nspname = 'public'
            AND rel.relname = 'policies'
            AND c.conname = '${S7_POLICIES_CHECK_NAME}'
            AND c.contype = 'c'
       ) AS policies_helper_check_exists`,
  );

  const state = columnRows[0];
  if (!state || !state.policies_is_nullable) {
    throw new Error(
      '[s7-production-gate] required policies.organization_id column is missing',
    );
  }

  let waitlistRowsWithTenantId = 0;
  if (state.waitlist_tenant_id_exists) {
    const rows = await runner.query<{ value: string | number }>(
      `SELECT count(*) AS value
         FROM public.waitlist_entries
        WHERE tenant_id IS NOT NULL`,
    );
    waitlistRowsWithTenantId = toCount(
      rows[0]?.value,
      'waitlist_entries.tenant_id',
    );
  }

  const policyRows = await runner.query<{ value: string | number }>(
    `SELECT count(*) AS value
       FROM public.policies
      WHERE organization_id IS NULL`,
  );

  return {
    waitlistTenantIdExists: state.waitlist_tenant_id_exists === true,
    waitlistRowsWithTenantId,
    policiesNullOrganizationId: toCount(
      policyRows[0]?.value,
      'policies.organization_id NULL',
    ),
    policiesOrganizationIdNullable: state.policies_is_nullable === 'YES',
    policiesHelperCheckExists: state.policies_helper_check_exists === true,
  };
}

export function assertS7ProductionPreconditions(
  evidence: S7ProductionEvidence,
  options: {
    readonly approved: boolean;
    readonly preview: boolean;
    readonly checkOnly?: boolean;
  },
): void {
  if (evidence.waitlistRowsWithTenantId !== 0) {
    throw new Error(
      `[s7-production-gate] refusing destructive cutover: ` +
        `${evidence.waitlistRowsWithTenantId} waitlist row(s) still carry tenant_id`,
    );
  }

  if (evidence.policiesNullOrganizationId !== 0) {
    throw new Error(
      `[s7-production-gate] refusing policy NOT NULL cutover: ` +
        `${evidence.policiesNullOrganizationId} policy row(s) have NULL organization_id`,
    );
  }

  const journaledCutoverPending = evidence.waitlistTenantIdExists;
  const convergencePending = evidence.policiesOrganizationIdNullable;

  if (
    convergencePending &&
    !journaledCutoverPending &&
    !evidence.policiesHelperCheckExists
  ) {
    throw new Error(
      '[s7-production-gate] policies.organization_id is nullable after the ' +
        'waitlist tenant column disappeared, but the S7 helper CHECK is missing; ' +
        'refusing to infer or repair unknown schema drift',
    );
  }

  if (
    (journaledCutoverPending || convergencePending) &&
    !options.preview &&
    !options.approved &&
    !options.checkOnly
  ) {
    throw new Error(
      `[s7-production-gate] S7 Production mutation requires explicit ` +
        `${S7_PRODUCTION_APPROVAL_FLAG}`,
    );
  }
}
