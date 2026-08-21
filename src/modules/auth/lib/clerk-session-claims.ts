/**
 * Shared Clerk session-claim email extraction, safe for both Edge
 * (src/proxy.ts) and Node (ClerkRequestIdentitySource.ts) contexts — no
 * dependency on the Node-only logger/DI infrastructure, just plain claim
 * reading.
 *
 * Clerk Session Token v2 exposes `email` by default. `primaryEmail` is
 * also supported as an explicit custom-claim contract for apps that
 * customize the session token instead of relying on the default claim —
 * both call sites that read a Clerk identity's email must honor this same
 * fallback order, or a deployment using `primaryEmail` silently loses
 * email-dependent behavior (e.g. DEMO_SHOWCASE_ALLOWED_EMAIL) in whichever
 * call site doesn't check it.
 */
export function extractClerkEmailClaim(
  sessionClaims: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!sessionClaims || typeof sessionClaims !== 'object') {
    return undefined;
  }

  for (const claimName of ['email', 'primaryEmail'] as const) {
    // False positive: claimName iterates a fixed literal tuple declared
    // above, never external/attacker-controlled input.
    // eslint-disable-next-line security/detect-object-injection
    const value = sessionClaims[claimName];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}
