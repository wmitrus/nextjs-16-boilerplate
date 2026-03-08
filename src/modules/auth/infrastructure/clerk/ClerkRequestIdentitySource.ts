import { auth } from '@clerk/nextjs/server';

import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';

type ClerkSessionClaims = Record<string, unknown> | null | undefined;

function readStringClaim(
  sessionClaims: ClerkSessionClaims,
  claimNames: readonly string[],
): string | undefined {
  for (const claimName of claimNames) {
    const value = sessionClaims?.[claimName];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function extractEmail(sessionClaims: ClerkSessionClaims): string | undefined {
  // Clerk Session Token v2 exposes `email` by default. We also support
  // `primaryEmail` as an explicit custom-claim contract for apps that
  // customize the session token instead of relying on default claims.
  return readStringClaim(sessionClaims, ['email', 'primaryEmail']);
}

export class ClerkRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  async get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = auth().then(
        ({ userId, orgId, orgRole, sessionClaims }) => ({
          userId: userId ?? undefined,
          email: extractEmail(sessionClaims),
          emailVerified:
            sessionClaims?.email_verified === true ? true : undefined,
          tenantExternalId: orgId ?? undefined,
          tenantRole: orgRole ?? undefined,
        }),
      );
    }

    return this.cached;
  }
}
