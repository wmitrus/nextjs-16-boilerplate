import { auth } from '@clerk/nextjs/server';

import type {
  RequestIdentitySource,
  RequestIdentitySourceData,
} from '@/core/contracts/identity';
import { resolveServerLogger } from '@/core/logger/di';

import { extractClerkEmailClaim } from '@/modules/auth/lib/clerk-session-claims';

type ClerkSessionClaims = Record<string, unknown> | null | undefined;
const logger = resolveServerLogger().child({
  type: 'API',
  category: 'auth',
  module: 'clerk-request-identity-source',
});

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
      this.cached = auth().then(
        ({ userId, orgId, orgRole, sessionId, sessionClaims }) => {
          // Every optional provider value is normalised once, here, and then
          // reused by both log lines and the returned identity. Clerk may omit
          // any of these, and `undefined` (not `null`, not `false`) is the one
          // shape the rest of the security layer and the logger both read
          // correctly -- so the decision is made once instead of being
          // repeated at each of the three places that need it.
          const externalUserId = userId ?? undefined;
          const orgExternalId = orgId ?? undefined;
          const tenantRole = orgRole ?? undefined;
          // Clerk's own session id, used as the provider-neutral logical
          // session reference for step-up proofs (SEC-48). Clerk rotates it
          // per sign-in, which is exactly the lifetime a proof may have.
          const logicalSessionId = sessionId ?? undefined;

          const email = extractClerkEmailClaim(sessionClaims);
          const emailClaimSource = resolveEmailClaimSource(sessionClaims);
          const emailVerified =
            sessionClaims?.email_verified === true ? true : undefined;
          const sessionTokenVersion =
            typeof sessionClaims?.v === 'number' ? sessionClaims.v : undefined;
          const activeOrganizationClaimPresent = Boolean(sessionClaims?.o);
          const sessionClaimKeys =
            sessionClaims && typeof sessionClaims === 'object'
              ? Object.keys(sessionClaims).sort()
              : [];

          if (!email) {
            logger.warn(
              {
                event: 'auth:identity_claims_missing_email',
                provider: 'clerk',
                userId: externalUserId,
                sessionClaimKeys,
                sessionTokenVersion,
                activeOrganizationClaimPresent,
                emailVerified,
              },
              'Clerk auth() sessionClaims did not contain a supported email claim',
            );
          }

          logger.debug(
            {
              event: 'auth:identity_claims_resolved',
              provider: 'clerk',
              userId: externalUserId,
              hasEmailClaim: email !== undefined,
              emailClaimSource,
              emailPreview: email ? maskEmail(email) : undefined,
              emailVerified,
              sessionClaimKeys,
              sessionTokenVersion,
              activeOrganizationClaimPresent,
              orgExternalIdPresent: Boolean(orgExternalId),
              tenantRole,
            },
            'Resolved Clerk identity claims from auth()',
          );

          return {
            userId: externalUserId,
            email,
            emailVerified,
            logicalSessionId,
            orgExternalId,
            tenantRole,
          };
        },
      );
    }

    return this.cached;
  }
}
