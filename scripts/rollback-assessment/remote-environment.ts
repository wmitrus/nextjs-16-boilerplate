import { execFileSync } from 'node:child_process';

import type {
  EnvironmentContractDimensions,
  EnvironmentContractEvidence,
} from '@/security/internal-api/rollback-environment-contract';

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
 * development configuration. These three env vars are explicit,
 * LOCAL_OPERATOR_DECLARED trust anchors dedicated to this comparison,
 * mirroring the existing `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`/
 * `GITHUB_REPOSITORY` local-anchor pattern -- never sourced from the
 * ambient `AUTH_PROVIDER`/`TENANCY_MODE`/`TENANT_CONTEXT_SOURCE` the
 * running process happens to have.
 *
 * Every dimension, including the legitimately-null one, must be an
 * explicit declaration: an *absent* `PRODUCTION_TENANT_CONTEXT_SOURCE` is
 * not evidence of anything and must not silently become `null` -- that
 * would let an operator who simply forgot to set it pass the comparison
 * for the wrong reason. The bounded sentinel `none` is the only way to
 * declare the null case; anything else absent/empty/unrecognized makes the
 * whole expected contract undetermined.
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

  return { authProvider, tenancyMode, tenantContextSource };
}

function requiredInternalApiKey(): string {
  const value = process.env.INTERNAL_API_KEY?.trim();
  if (!value) throw new Error('INTERNAL_API_KEY is required.');
  return value;
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
 * internal-API-guarded environment-contract endpoint. No LIST, no retry, no
 * redirect, no fallback URL/candidate. Both the application's own
 * `INTERNAL_API_KEY` and, independently, `VERCEL_AUTOMATION_BYPASS_SECRET`
 * (required for Standard/Deployment-Protected immutable Production URLs,
 * matching this repository's existing Production smoke contract) are
 * resolved and validated -- failing closed before any `fetch` -- rather
 * than read eagerly at import time or module load. Neither secret is ever
 * logged, returned, or included in a thrown message.
 */
export async function readCandidateEnvironmentContract(
  immutableUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EnvironmentContractEvidence> {
  const internalApiKey = requiredInternalApiKey();
  const protectionBypassSecret = requiredVercelProtectionBypassSecret();
  const signal = AbortSignal.timeout(ENVIRONMENT_CONTRACT_TIMEOUT_MS);
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
          'x-vercel-set-bypass-cookie': 'true',
        },
        method: 'GET',
        redirect: 'error',
        signal,
      },
    );
  } catch {
    throw new Error('Candidate environment-contract read failed.');
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
