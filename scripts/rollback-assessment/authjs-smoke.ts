/**
 * A4.2c: the one authorized AuthJS read-only rollback smoke.
 *
 * READ-ONLY. Two bounded GETs against the *already validated* trusted
 * candidate's own immutable Production URL:
 *
 *   A. GET /auth/signin        -> HTML sign-in surface still renders
 *   B. GET /api/auth/session   -> AuthJS session endpoint still speaks JSON
 *
 * It never authenticates a user, never submits credentials, never creates a
 * fixture, never calls a mutation endpoint, and never uses `INTERNAL_API_KEY`.
 * It mirrors the surfaces `e2e/vercel-runtime-smoke.spec.ts` already covers,
 * without invoking any login or fixture code.
 *
 * `VERCEL_AUTOMATION_BYPASS_SECRET` (the same contract `prod-deploy.yml`'s
 * Production smoke step relies on for Standard/Deployment-Protected immutable
 * URLs) is resolved lazily here, only when the smoke is actually about to run,
 * and is never logged, returned, or placed in a thrown/returned message.
 *
 * `x-vercel-set-bypass-cookie` is deliberately NOT sent: it previously
 * provoked a 307 on this immutable Production URL and was intentionally
 * removed from the A4.2b environment probe. A single stateless GET needs no
 * persistent bypass cookie.
 */

const SMOKE_TIMEOUT_MS = 10_000;

/**
 * Conservative, finite per-endpoint body ceilings. The sign-in route is a
 * full HTML document; the session route is a tiny JSON envelope. Neither
 * needs to be read past these bounds to prove the contract, and an
 * unbounded read is itself a failure mode this smoke exists to avoid.
 */
const MAX_SIGNIN_BODY_BYTES = 512 * 1024;
const MAX_SESSION_BODY_BYTES = 64 * 1024;

export interface AuthjsSmokeEvidence {
  provider: 'authjs';
  session: 'PASS';
  signIn: 'PASS';
}

export type AuthjsSmokeResult =
  | { evidence: AuthjsSmokeEvidence; status: 'OK' }
  | { reason: string; status: 'ERROR' };

function requiredProtectionBypassSecret(): string {
  const value = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!value) {
    throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is required.');
  }
  return value;
}

/**
 * Reads at most `maxBytes` of the response stream, cancelling and throwing
 * the moment that bound is exceeded. Never returns partial-but-unbounded
 * content and never surfaces the body in an error.
 */
async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const body = response.body;
  if (!body) {
    throw new Error('Smoke response carried no readable body.');
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error('Smoke response exceeded its bounded size.');
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

/**
 * The media type only: the trimmed, lowercased portion before the first
 * `;`. `text/html; charset=utf-8` -> `text/html`. Callers require exact
 * equality against a known type, so lookalikes (`text/html-bogus`,
 * `application/jsonp`, `application/json-patch+json`) are rejected.
 */
function mediaType(response: Response): string {
  const raw = response.headers.get('content-type') ?? '';
  return raw.split(';', 1)[0].trim().toLowerCase();
}

/**
 * A response that is being rejected before its body is bounded-read must
 * still have that body released, best effort. A cancel failure is swallowed
 * -- it can never turn a rejected response into valid evidence.
 */
async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Releasing an already-errored/locked body is not evidence of anything.
  }
}

/**
 * One bounded GET. `method: 'GET'`, `cache: 'no-store'`, `redirect: 'error'`,
 * a single `AbortSignal.timeout` (never a retry), and only the two headers
 * this smoke is allowed to send: an endpoint-appropriate `accept` and the
 * Vercel protection-bypass secret. No cookies, no credentials, no internal
 * key, no user identifiers.
 */
async function boundedGet(
  url: URL,
  accept: string,
  protectionBypassSecret: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(url, {
    cache: 'no-store',
    headers: {
      accept,
      'x-vercel-protection-bypass': protectionBypassSecret,
    },
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(SMOKE_TIMEOUT_MS),
  });
}

async function smokeSignIn(
  immutableUrl: string,
  protectionBypassSecret: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await boundedGet(
      new URL('/auth/signin', immutableUrl),
      'text/html',
      protectionBypassSecret,
      fetchImpl,
    );
  } catch {
    throw new Error('AuthJS sign-in smoke request failed.');
  }
  if (response.status !== 200) {
    await cancelBody(response);
    throw new Error(
      `AuthJS sign-in smoke returned an unexpected status (${response.status}).`,
    );
  }
  if (mediaType(response) !== 'text/html') {
    await cancelBody(response);
    throw new Error('AuthJS sign-in smoke returned a non-HTML content type.');
  }
  const body = await readBoundedText(response, MAX_SIGNIN_BODY_BYTES);
  if (body.length === 0) {
    throw new Error('AuthJS sign-in smoke returned an empty body.');
  }
}

async function smokeSession(
  immutableUrl: string,
  protectionBypassSecret: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await boundedGet(
      new URL('/api/auth/session', immutableUrl),
      'application/json',
      protectionBypassSecret,
      fetchImpl,
    );
  } catch {
    throw new Error('AuthJS session smoke request failed.');
  }
  if (response.status !== 200) {
    await cancelBody(response);
    throw new Error(
      `AuthJS session smoke returned an unexpected status (${response.status}).`,
    );
  }
  if (mediaType(response) !== 'application/json') {
    await cancelBody(response);
    throw new Error('AuthJS session smoke returned a non-JSON content type.');
  }
  const body = await readBoundedText(response, MAX_SESSION_BODY_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('AuthJS session smoke returned an unparseable body.');
  }
  // Least permissive truthful contract: the hosted smoke
  // (`e2e/vercel-runtime-smoke.spec.ts`) already asserts this endpoint
  // resolves to a non-null object; an anonymous `{}` must pass with no
  // fixture, but `null` and arrays must not.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AuthJS session smoke returned an unexpected shape.');
  }
}

/**
 * Runs the bounded, read-only AuthJS smoke against `immutableUrl` (which must
 * originate from a `TrustedProductionCandidate`). Sign-in is proven before
 * the session request is made; any deviation fails closed to a generic
 * ERROR whose message never contains a response body, a URL, headers, or a
 * secret.
 */
export async function runAuthjsReadOnlySmoke(
  immutableUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthjsSmokeResult> {
  let protectionBypassSecret: string;
  try {
    protectionBypassSecret = requiredProtectionBypassSecret();
  } catch {
    return {
      reason: 'AuthJS read-only smoke prerequisites are not configured.',
      status: 'ERROR',
    };
  }
  try {
    await smokeSignIn(immutableUrl, protectionBypassSecret, fetchImpl);
  } catch {
    return {
      reason: 'AuthJS sign-in read-only smoke did not satisfy its contract.',
      status: 'ERROR',
    };
  }
  try {
    await smokeSession(immutableUrl, protectionBypassSecret, fetchImpl);
  } catch {
    return {
      reason: 'AuthJS session read-only smoke did not satisfy its contract.',
      status: 'ERROR',
    };
  }
  return {
    evidence: { provider: 'authjs', session: 'PASS', signIn: 'PASS' },
    status: 'OK',
  };
}
