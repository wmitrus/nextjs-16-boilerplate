import { execFileSync } from 'node:child_process';

import { z } from 'zod';

import type {
  EnvironmentContractDimensions,
  EnvironmentContractEvidence,
} from '@/security/internal-api/rollback-environment-contract';

// Bounded expected-side validators for the two new v2 dimensions. Kept as a
// narrow local duplicate of the equivalent candidate-side checks in
// `@/security/internal-api/rollback-environment-contract` rather than a
// shared cross-layer import, so scripts/ and src/ stay independently
// verifiable -- but semantics (UUID form, host/name shape) are identical, so
// candidate and expected sides accept/reject the same values.
const MAX_PRODUCTION_DATABASE_HOST_LENGTH = 255;
const MAX_PRODUCTION_DATABASE_NAME_BYTES = 63;
const PRODUCTION_DATABASE_HOST_PATTERN = /^[a-zA-Z0-9.-]{1,255}$/;
const productionTenantIdSchema = z.uuid();

function isValidProductionDatabaseHost(value: string): boolean {
  return (
    value.length <= MAX_PRODUCTION_DATABASE_HOST_LENGTH &&
    PRODUCTION_DATABASE_HOST_PATTERN.test(value)
  );
}

function isValidProductionDatabaseName(value: string): boolean {
  return (
    value.length > 0 &&
    !/[\s\u0000-\u001f\u007f]/.test(value) &&
    Buffer.byteLength(value, 'utf8') <= MAX_PRODUCTION_DATABASE_NAME_BYTES
  );
}

function isValidProductionTenantId(value: string): boolean {
  return productionTenantIdSchema.safeParse(value).success;
}

const ENVIRONMENT_CONTRACT_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4096;
const ENVIRONMENT_CONTRACT_ROUTE_PATH =
  'src/app/api/internal/rollback-assessment/environment-contract/route.ts';

type GitExecutor = typeof execFileSync;

export type CandidateEnvironmentInstrumentationResult =
  | { status: 'PRESENT' }
  | { reason: string; status: 'BLOCKED' | 'ERROR' };

/**
 * The candidate deployment is immutable and was built from a fixed Git
 * commit -- the environment-contract endpoint only exists on a candidate
 * whose commit actually contains it. A candidate that predates this
 * instrumentation will 404 forever; that is not evidence of anything and
 * must never be attempted, let alone read as ERROR. This is a purely local,
 * deterministic check against the trusted candidate SHA (`git cat-file -e`,
 * no fetch) that runs before any network request.
 */
export function checkCandidateEnvironmentContractInstrumentation(
  gitSha: string,
  executor: GitExecutor = execFileSync,
): CandidateEnvironmentInstrumentationResult {
  let shallow: string;
  try {
    shallow = executor('git', ['rev-parse', '--is-shallow-repository'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
  } catch {
    return {
      reason: 'Could not determine whether local Git history is shallow.',
      status: 'ERROR',
    };
  }
  if (shallow === 'true') {
    return {
      reason:
        'Local Git history is shallow; candidate environment-contract instrumentation cannot be determined locally.',
      status: 'BLOCKED',
    };
  }
  if (shallow !== 'false') {
    return {
      reason: 'Local Git shallow-history state is invalid.',
      status: 'ERROR',
    };
  }
  // Distinct from "path missing at this commit": a shallow-safe repo can
  // still lack the commit object itself (never fetched/pruned). Checking
  // this separately means a BLOCKED result's reason never conflates "this
  // commit was never resolvable here" with "this commit is resolvable and
  // genuinely predates the route" -- the two require different operator
  // action and must not be reported identically.
  try {
    executor('git', ['cat-file', '-e', `${gitSha}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return {
      reason: 'Candidate commit is not available in local Git history.',
      status: 'BLOCKED',
    };
  }
  try {
    executor(
      'git',
      ['cat-file', '-e', `${gitSha}:${ENVIRONMENT_CONTRACT_ROUTE_PATH}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    return {
      reason:
        'Rollback candidate predates deployment-bound environment-contract instrumentation.',
      status: 'BLOCKED',
    };
  }
  return { status: 'PRESENT' };
}

/**
 * The authoritative EXPECTED Production environment contract is NOT the
 * operator's own ambient local environment -- `@/core/env` in the shell
 * running `rollback:assess` could just as easily resolve to a Preview or
 * development configuration, and its `DATABASE_URL` is never used here
 * either. These env vars are explicit, LOCAL_OPERATOR_DECLARED trust
 * anchors dedicated to this comparison, mirroring the existing
 * `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`/`GITHUB_REPOSITORY` and
 * `PRODUCTION_DATABASE_HOST`/`PRODUCTION_DATABASE_NAME` (schema-compat)
 * local-anchor patterns -- never sourced from the ambient
 * `AUTH_PROVIDER`/`TENANCY_MODE`/`TENANT_CONTEXT_SOURCE`/`DATABASE_URL`/
 * `DEFAULT_TENANT_ID` the running process happens to have.
 *
 * Every dimension, including the legitimately-null ones, must be an
 * explicit declaration: an *absent* `PRODUCTION_TENANT_CONTEXT_SOURCE` is
 * not evidence of anything and must not silently become `null` -- that
 * would let an operator who simply forgot to set it pass the comparison
 * for the wrong reason. The bounded sentinel `none` is the only way to
 * declare the null case; anything else absent/empty/unrecognized makes the
 * whole expected contract undetermined.
 *
 * `databaseHost` here is deliberately pinned by `PRODUCTION_RUNTIME_DATABASE_HOST`,
 * NOT `PRODUCTION_DATABASE_HOST`: Neon (and this repository's own
 * `DATABASE_URL` vs `DATABASE_URL_UNPOOLED`) intentionally exposes distinct
 * pooled-runtime and direct/unpooled hostnames for the same logical
 * database. The candidate-side dimension being compared here is derived
 * from the candidate's own pooled `env.DATABASE_URL` (see
 * `rollback-environment-contract.ts`), so its expected counterpart must be
 * the pooled-runtime pin, not the direct/unpooled pin
 * `resolveVerifiedProductionDatabaseUrl()` uses for the separate schema
 * proof -- reusing one pin for both would fail closed on a perfectly valid
 * Production configuration whenever the two Neon endpoints legitimately
 * differ. No `-pooler`-suffix heuristic or other host canonicalization is
 * applied; both pins are independent, exact string pins. `PRODUCTION_DATABASE_NAME`
 * remains the single shared anchor for both proofs -- there is exactly one
 * logical Production database, so no `PRODUCTION_RUNTIME_DATABASE_NAME` is
 * introduced. `PRODUCTION_RUNTIME_DATABASE_HOST` and `PRODUCTION_DATABASE_NAME`
 * are always required. `PRODUCTION_DB_PROVIDER` and `PRODUCTION_DB_DRIVER`
 * are also always required -- the expected effective DB runtime, never
 * inferred from ambient `DB_PROVIDER`/`DB_DRIVER`/`NODE_ENV`. A correct
 * database host/name proves nothing if the candidate is actually routing to
 * a different DB runtime (e.g. PGlite instead of Postgres). `PRODUCTION_DEFAULT_TENANT_ID`
 * is required, and must be a valid UUID, only when
 * `PRODUCTION_TENANCY_MODE=single`; for `org`/`personal` it is never read,
 * even if set, and the expected `defaultTenantId` is always `null`.
 */
export function readOperatorDeclaredProductionContractDimensions():
  | EnvironmentContractDimensions
  | undefined {
  const authProvider = process.env.PRODUCTION_AUTH_PROVIDER?.trim();
  if (authProvider !== 'authjs' && authProvider !== 'clerk') return undefined;

  const tenancyMode = process.env.PRODUCTION_TENANCY_MODE?.trim();
  if (
    tenancyMode !== 'single' &&
    tenancyMode !== 'personal' &&
    tenancyMode !== 'org'
  ) {
    return undefined;
  }

  const tenantContextSourceRaw =
    process.env.PRODUCTION_TENANT_CONTEXT_SOURCE?.trim();
  let tenantContextSource: 'db' | 'provider' | null;
  if (tenantContextSourceRaw === 'none') {
    tenantContextSource = null;
  } else if (
    tenantContextSourceRaw === 'provider' ||
    tenantContextSourceRaw === 'db'
  ) {
    tenantContextSource = tenantContextSourceRaw;
  } else {
    // Missing, empty, or an unrecognized value -- none of these are an
    // explicit declaration.
    return undefined;
  }

  // Pooled-runtime pin, independent of PRODUCTION_DATABASE_HOST (the
  // direct/unpooled pin `resolveVerifiedProductionDatabaseUrl()` uses for
  // the separate schema proof) -- see the doc comment above.
  const databaseHost = process.env.PRODUCTION_RUNTIME_DATABASE_HOST?.trim();
  if (!databaseHost || !isValidProductionDatabaseHost(databaseHost)) {
    return undefined;
  }

  const databaseName = process.env.PRODUCTION_DATABASE_NAME?.trim();
  if (!databaseName || !isValidProductionDatabaseName(databaseName)) {
    return undefined;
  }

  // Expected effective DB runtime -- always explicit, never inferred from
  // ambient DB_PROVIDER/DB_DRIVER/NODE_ENV/DATABASE_URL. Unlike the
  // candidate-side resolver (which models every DB runtime the application
  // configuration can select, so it can truthfully attest whatever is
  // actually configured, including prisma/pglite), the expected Production
  // contract answers a stricter question: what is the currently supported
  // Production DB runtime? Prisma is not implemented by `createDb()`, and
  // PGlite is not the Production Neon/Postgres runtime this contract
  // proves -- so only the exact pair below is accepted here. Anything else
  // (including prisma/pglite themselves) leaves the expected contract
  // undefined, never a matching alternate fingerprint.
  const dbProvider = process.env.PRODUCTION_DB_PROVIDER?.trim();
  if (dbProvider !== 'drizzle') return undefined;

  const dbDriver = process.env.PRODUCTION_DB_DRIVER?.trim();
  if (dbDriver !== 'postgres') return undefined;

  let defaultTenantId: string | null;
  if (tenancyMode === 'single') {
    const rawTenantId = process.env.PRODUCTION_DEFAULT_TENANT_ID?.trim();
    if (!rawTenantId || !isValidProductionTenantId(rawTenantId)) {
      return undefined;
    }
    defaultTenantId = rawTenantId;
  } else {
    // org/personal: never read PRODUCTION_DEFAULT_TENANT_ID, even if an
    // operator happens to have it set -- it is not applicable in this mode.
    defaultTenantId = null;
  }

  return {
    authProvider,
    databaseHost,
    databaseName,
    dbDriver,
    dbProvider,
    defaultTenantId,
    tenancyMode,
    tenantContextSource,
  };
}

function requiredInternalApiKey(): string {
  const value = process.env.INTERNAL_API_KEY?.trim();
  if (!value) throw new Error('INTERNAL_API_KEY is required.');
  return value;
}

/**
 * The repository's existing SEC-44 one-generation internal-API-key rotation
 * model, mirrored from the Preview canary's own runtime probe: the current
 * key is required, the previous key is optional and deduplicated against
 * the current one, and at most two keys are ever produced.
 */
function resolveInternalApiKeys(): string[] {
  const current = requiredInternalApiKey();
  const previous = process.env.INTERNAL_API_KEY_PREVIOUS?.trim();
  return previous && previous !== current ? [current, previous] : [current];
}

/**
 * A candidate's immutable Production URL can be covered by Vercel Standard/
 * Deployment Protection, exactly like the repository's own `prod-deploy.yml`
 * Production smoke step -- this is the same `VERCEL_AUTOMATION_BYPASS_SECRET`
 * contract that step already relies on, read independently of
 * `INTERNAL_API_KEY` (the application's own auth) and required only here,
 * lazily, at the one call site that is actually about to perform the
 * network read.
 */
function requiredVercelProtectionBypassSecret(): string {
  const value = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!value) {
    throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is required.');
  }
  return value;
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error(
      'Candidate environment-contract read returned invalid evidence.',
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(
          'Candidate environment-contract response is too large.',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseEnvironmentContractEvidence(
  raw: string,
): EnvironmentContractEvidence {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Candidate environment-contract response is malformed.');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 3
  ) {
    throw new Error('Candidate environment-contract response is malformed.');
  }
  const value = parsed as Record<string, unknown>;
  if (
    (value.authProvider !== 'authjs' && value.authProvider !== 'clerk') ||
    typeof value.contractVersion !== 'string' ||
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint)
  ) {
    throw new Error('Candidate environment-contract response is malformed.');
  }
  return {
    authProvider: value.authProvider,
    contractVersion:
      value.contractVersion as EnvironmentContractEvidence['contractVersion'],
    fingerprint: value.fingerprint,
  };
}

/**
 * The one authorized "production environment" read: a single bounded GET
 * against the trusted candidate's own immutable deployment URL, at the
 * internal-API-guarded environment-contract endpoint. No LIST, no generic
 * retry, no redirect, no fallback URL/candidate. Both the application's own
 * `INTERNAL_API_KEY` and, independently, `VERCEL_AUTOMATION_BYPASS_SECRET`
 * (required for Standard/Deployment-Protected immutable Production URLs,
 * matching this repository's existing Production smoke contract) are
 * resolved and validated -- failing closed before any `fetch` -- rather
 * than read eagerly at import time or module load. Neither secret is ever
 * logged, returned, or included in a thrown message.
 *
 * The ONE exception to "no retry" is the repository's existing SEC-44
 * one-generation `INTERNAL_API_KEY_PREVIOUS` rotation fallback, mirrored
 * exactly from the Preview canary's own runtime probe
 * (`probeRuntimeDatabaseBinding`): a first response that is exactly HTTP 403
 * triggers exactly one retry with the previous key, if one is configured and
 * distinct from the current key. Every other status (400/401/404/429/5xx),
 * a network error, a timeout, or a malformed 200 body is never retried --
 * this is not a general retry mechanism.
 */
export async function readCandidateEnvironmentContract(
  immutableUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EnvironmentContractEvidence> {
  const internalApiKeys = resolveInternalApiKeys();
  const protectionBypassSecret = requiredVercelProtectionBypassSecret();
  const signal = AbortSignal.timeout(ENVIRONMENT_CONTRACT_TIMEOUT_MS);
  for (const [index, internalApiKey] of internalApiKeys.entries()) {
    let response: Response;
    try {
      response = await fetchImpl(
        new URL(
          '/api/internal/rollback-assessment/environment-contract',
          immutableUrl,
        ),
        {
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'x-internal-key': internalApiKey,
            'x-vercel-protection-bypass': protectionBypassSecret,
          },
          method: 'GET',
          redirect: 'error',
          signal,
        },
      );
    } catch {
      throw new Error('Candidate environment-contract read failed.');
    }
    if (
      response.status === 403 &&
      index === 0 &&
      internalApiKeys.length === 2
    ) {
      // SEC-44's one-generation key rotation fallback, not a transient retry.
      try {
        await response.body?.cancel();
      } catch {
        // A rejected response body is never evidence and must not change fallback.
      }
      continue;
    }
    if (response.status !== 200) {
      throw new Error(
        `Candidate environment-contract read failed (HTTP ${response.status}).`,
      );
    }
    return parseEnvironmentContractEvidence(
      await readBoundedResponseBody(response),
    );
  }
  throw new Error('Candidate environment-contract read failed (HTTP 403).');
}
