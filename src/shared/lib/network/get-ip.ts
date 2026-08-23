import { env, resolveDeploymentProxyValue } from '@/core/env';

import {
  createClientIpResolver,
  type ClientIp,
} from '@/shared/lib/network/client-ip';

let _resolver: ((headers: Headers) => ClientIp) | undefined;

function getResolver(): (headers: Headers) => ClientIp {
  if (_resolver) return _resolver;

  const proxy = resolveDeploymentProxyValue(
    env.DEPLOYMENT_PROXY,
    env.NODE_ENV,
    env.VERCEL_ENV,
  );

  _resolver = createClientIpResolver({
    proxy,
    trustedProxyCidrs: (env.TRUSTED_PROXY_CIDRS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  });
  return _resolver;
}

/**
 * Resolves the client IP under this deployment's declared trust model.
 *
 * Returns a discriminated `ClientIp`, never a bare string. The previous
 * version returned `'127.0.0.1'` whenever no header was present and believed
 * `x-forwarded-for` from anyone who sent it — so the caller could not tell a
 * real client from a fabricated one, and every header-less client shared a
 * single loopback rate-limit bucket. See SEC-43.
 *
 * Callers must handle `kind: 'untrusted'` deliberately:
 * `rateLimitKeyForClient()` for anything keyed on the client, `null` for
 * anything recording where a request came from.
 */
export async function getClientIp(headers: Headers): Promise<ClientIp> {
  return getResolver()(headers);
}

/**
 * Resets the memoised resolver. Tests only — the resolver is built from env
 * once per process, and a test that changes `DEPLOYMENT_PROXY` needs the next
 * call to see it.
 */
export function resetClientIpResolverForTests(): void {
  _resolver = undefined;
}

/**
 * The single bucket every unidentifiable client shares.
 *
 * One stable key rather than a per-request one on purpose. A fresh key per
 * request would mean no rate limit at all for these clients — silently
 * undoing SEC-42 for exactly the requests whose origin cannot be verified.
 * A shared bucket is blunt (unidentifiable clients can exhaust each other's
 * allowance) but it is a limit, and its shared-fate is visible in the WARN
 * that accompanies it rather than hidden in an empty counter.
 */
export const UNTRUSTED_CLIENT_BUCKET = 'untrusted-client';

/**
 * Builds a rate-limit key from a resolved client IP.
 *
 * `prefix` keeps each endpoint's buckets separate, so the shared untrusted
 * bucket is per-endpoint rather than one global bucket across the whole app.
 */
export function rateLimitKeyForClient(
  prefix: string,
  client: ClientIp,
): string {
  return client.kind === 'trusted'
    ? `${prefix}:${client.ip}`
    : `${prefix}:${UNTRUSTED_CLIENT_BUCKET}`;
}

/**
 * The value to record for "where did this request come from".
 *
 * `null` when untrusted: an audit row that names an address the request may
 * never have come from is worse than one that admits it does not know.
 */
export function auditIpForClient(client: ClientIp): string | null {
  return client.kind === 'trusted' ? client.ip : null;
}
