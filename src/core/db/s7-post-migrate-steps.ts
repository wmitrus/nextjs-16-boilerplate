import type { SqlRunner } from './post-migrate-steps';

const CHECK_NAME = 'policies_organization_id_not_null';

export interface S7PostMigrateResult {
  readonly policiesOrganizationId: 'converged' | 'already-not-null';
  readonly waitlistTenantIdAbsent: true;
}

type PoliciesStateRow = {
  is_nullable: 'YES' | 'NO';
};

type CheckStateRow = {
  convalidated: boolean;
  definition: string;
};

function normalizeCheckDefinition(value: string): string {
  return value
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+not valid$/, '')
    .trim();
}

async function readPoliciesNullable(
  runner: SqlRunner,
): Promise<'YES' | 'NO' | null> {
  const rows = await runner.query<PoliciesStateRow>(
    `SELECT is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'policies'
        AND column_name = 'organization_id'`,
  );

  return rows[0]?.is_nullable ?? null;
}

async function waitlistTenantIdExists(runner: SqlRunner): Promise<boolean> {
  const rows = await runner.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'waitlist_entries'
          AND column_name = 'tenant_id'
     ) AS present`,
  );

  return rows[0]?.present === true;
}

async function readCheckState(
  runner: SqlRunner,
): Promise<CheckStateRow | null> {
  const rows = await runner.query<CheckStateRow>(
    `SELECT c.convalidated,
            pg_get_constraintdef(c.oid, true) AS definition
       FROM pg_constraint c
       JOIN pg_class rel
         ON rel.oid = c.conrelid
       JOIN pg_namespace ns
         ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public'
        AND rel.relname = 'policies'
        AND c.conname = '${CHECK_NAME}'
        AND c.contype = 'c'`,
  );

  return rows[0] ?? null;
}

export async function runS7PostMigrateSteps(
  runner: SqlRunner,
): Promise<S7PostMigrateResult> {
  if (await waitlistTenantIdExists(runner)) {
    throw new Error(
      '[s7-post-migrate] waitlist_entries.tenant_id still exists after migration 0025',
    );
  }

  const nullable = await readPoliciesNullable(runner);
  if (nullable === null) {
    throw new Error(
      '[s7-post-migrate] policies.organization_id column is missing',
    );
  }

  const check = await readCheckState(runner);

  if (check) {
    const normalized = normalizeCheckDefinition(check.definition);
    if (
      normalized !== 'check (organization_id is not null)' &&
      normalized !== 'check ((organization_id is not null))'
    ) {
      throw new Error(
        `[s7-post-migrate] ${CHECK_NAME} has an unexpected definition: ${check.definition}`,
      );
    }
  }

  if (nullable === 'NO' && !check) {
    return {
      policiesOrganizationId: 'already-not-null',
      waitlistTenantIdAbsent: true,
    };
  }

  if (nullable === 'YES' && !check) {
    throw new Error(
      `[s7-post-migrate] required CHECK constraint ${CHECK_NAME} is missing`,
    );
  }

  await runner.query(`SET lock_timeout = '3s'`);
  await runner.query(`SET statement_timeout = '1h'`);

  try {
    if (nullable === 'YES') {
      if (!check?.convalidated) {
        await runner.query(
          `ALTER TABLE public.policies VALIDATE CONSTRAINT "${CHECK_NAME}"`,
        );
      }

      await runner.query(
        'ALTER TABLE public.policies ALTER COLUMN organization_id SET NOT NULL',
      );
    }

    await runner.query(
      `ALTER TABLE public.policies DROP CONSTRAINT "${CHECK_NAME}"`,
    );
  } finally {
    await runner.query('SET lock_timeout = DEFAULT');
    await runner.query('SET statement_timeout = DEFAULT');
  }

  const finalNullable = await readPoliciesNullable(runner);
  if (finalNullable !== 'NO') {
    throw new Error(
      '[s7-post-migrate] policies.organization_id did not converge to NOT NULL',
    );
  }

  return {
    policiesOrganizationId: 'converged',
    waitlistTenantIdAbsent: true,
  };
}
