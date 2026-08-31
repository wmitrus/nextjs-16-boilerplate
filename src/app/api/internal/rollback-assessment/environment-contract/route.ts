import { connection, NextResponse } from 'next/server';

import { env } from '@/core/env';

import {
  buildEnvironmentContractEvidence,
  readCurrentEnvironmentContractDimensions,
} from '@/security/internal-api/rollback-environment-contract';

const noStoreHeaders = { 'Cache-Control': 'private, no-store' };

function unavailable(status: 404 | 500) {
  return NextResponse.json(
    { error: 'Unavailable' },
    { headers: noStoreHeaders, status },
  );
}

/**
 * OZI-78 A4.2b: the deployment-bound environment-contract attestation a
 * rollback candidate's own immutable runtime returns. Protected by the
 * existing `withInternalApiGuard` (any `/api/internal/**` path, composed in
 * `src/proxy.ts`) -- no additional guard code needed here.
 *
 * Production-only: a candidate is by definition a Production deployment, and
 * this must reflect what that frozen deployment actually runs with, not a
 * Preview/dev build's config.
 *
 * The response is bounded to exactly the fields `EnvironmentContractEvidence`
 * declares -- no raw env values, no DATABASE_URL, no secrets, no API keys,
 * no user/org/tenant identifiers, no dynamic key list. The v2/v3 dimensions
 * (`databaseHost`, `databaseName`, `dbDriver`, `dbProvider`,
 * `defaultTenantId`) participate only in `fingerprint`'s SHA-256 digest --
 * none of them, nor the raw DATABASE_URL/DB_DRIVER/DB_PROVIDER they were
 * derived from, is ever returned in the clear.
 */
export async function GET() {
  await connection();
  if (env.VERCEL_ENV !== 'production') return unavailable(404);
  const dimensions = readCurrentEnvironmentContractDimensions();
  if (!dimensions) return unavailable(500);
  return NextResponse.json(buildEnvironmentContractEvidence(dimensions), {
    headers: noStoreHeaders,
  });
}
