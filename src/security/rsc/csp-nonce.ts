import { headers } from 'next/headers';

import { env } from '@/core/env';

/**
 * Reads the per-request CSP nonce set by the proxy pipeline
 * (src/proxy.ts's terminalHandler, RouteContext.nonce) for use by an
 * inline/loader `<Script nonce={...}>` tag or a provider that accepts one
 * (e.g. Clerk's `nonce` + `dynamic` props).
 *
 * Deliberately checks CSP_SCRIPT_STRICT_MODE BEFORE calling headers():
 * headers() is a Dynamic API that opts the calling Server Component into
 * per-request rendering the moment it's invoked, regardless of whether a
 * nonce is actually found. With CSP_SCRIPT_STRICT_MODE off (the emergency
 * rollback — see with-headers.ts), no nonce was ever generated, so this
 * must return without touching headers() at all, or the escape hatch would
 * stop being a true no-cost rollback.
 *
 * Callers should be small, dedicated Server Components (not the whole
 * layout) so the dynamic-rendering cost this incurs stays scoped to
 * whatever actually needs the nonce.
 */
export async function getCspNonce(): Promise<string | undefined> {
  if (!env.CSP_SCRIPT_STRICT_MODE) {
    return undefined;
  }

  const headerList = await headers();
  return headerList.get('x-nonce') ?? undefined;
}
