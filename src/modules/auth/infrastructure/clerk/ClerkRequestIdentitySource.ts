import { auth } from '@clerk/nextjs/server';

import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';
import { resolveServerLogger } from '@/core/logger/di';

type ClerkSessionClaims = Record<string, unknown> | null | undefined;
const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'clerk-request-identity-source',
});

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

function resolveEmailClaimSource(
  sessionClaims: ClerkSessionClaims,
): 'email' | 'primaryEmail' | undefined {
  if (
    typeof sessionClaims?.email === 'string' &&
    sessionClaims.email.length > 0
  ) {
    return 'email';
  }

  if (
    typeof sessionClaims?.primaryEmail === 'string' &&
    sessionClaims.primaryEmail.length > 0
  ) {
    return 'primaryEmail';
  }

  return undefined;
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) {
    return '[invalid-email]';
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
}

export class ClerkRequestIdentitySource implements RequestIdentitySource {
  private cached?: Promise<RequestIdentitySourceData>;

  async get(): Promise<RequestIdentitySourceData> {
    if (!this.cached) {
      this.cached = auth().then(({ userId, orgId, orgRole, sessionClaims }) => {
        const email = extractEmail(sessionClaims);
        const emailClaimSource = resolveEmailClaimSource(sessionClaims);
        const sessionClaimKeys =
          sessionClaims && typeof sessionClaims === 'object'
            ? Object.keys(sessionClaims).sort()
            : [];

        if (!email) {
          logger.warn(
            {
              event: 'auth:identity_claims_missing_email',
              provider: 'clerk',
              userId: userId ?? undefined,
              sessionClaimKeys,
              sessionTokenVersion:
                typeof sessionClaims?.v === 'number'
                  ? sessionClaims.v
                  : undefined,
              activeOrganizationClaimPresent: Boolean(sessionClaims?.o),
              emailVerified:
                sessionClaims?.email_verified === true ? true : undefined,
            },
            'Clerk auth() sessionClaims did not contain a supported email claim',
          );
        }

        logger.debug(
          {
            event: 'auth:identity_claims_resolved',
            provider: 'clerk',
            userId: userId ?? undefined,
            hasEmailClaim: email !== undefined,
            emailClaimSource,
            emailPreview: email ? maskEmail(email) : undefined,
            emailVerified:
              sessionClaims?.email_verified === true ? true : undefined,
            sessionClaimKeys,
            sessionTokenVersion:
              typeof sessionClaims?.v === 'number'
                ? sessionClaims.v
                : undefined,
            activeOrganizationClaimPresent: Boolean(sessionClaims?.o),
            tenantExternalIdPresent: Boolean(orgId),
            tenantRole: orgRole ?? undefined,
          },
          'Resolved Clerk identity claims from auth()',
        );

        return {
          userId: userId ?? undefined,
          email,
          emailVerified:
            sessionClaims?.email_verified === true ? true : undefined,
          tenantExternalId: orgId ?? undefined,
          tenantRole: orgRole ?? undefined,
        };
      });
    }

    return this.cached;
  }
}
