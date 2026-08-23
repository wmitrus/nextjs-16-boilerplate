import { headers } from 'next/headers';

import { UserNotProvisionedError } from '@/core/contracts/identity';
import {
  MissingTenantContextError,
  TenantMembershipRequiredError,
  TenantNotProvisionedError,
} from '@/core/contracts/tenancy';
import { env } from '@/core/env';

import { auditIpForClient, getClientIp } from '@/shared/lib/network/get-ip';

import type { NodeSecurityContextDependencies } from './security-dependencies';
import { isSessionRevoked } from './session-revocation';
export type { SecurityContextDependencies } from './security-dependencies';

export type ReadinessStatus =
  | 'ALLOWED'
  | 'BOOTSTRAP_REQUIRED'
  | 'ONBOARDING_REQUIRED'
  | 'ACCOUNT_DISABLED'
  | 'TENANT_CONTEXT_REQUIRED'
  | 'TENANT_MEMBERSHIP_REQUIRED'
  | 'UNAUTHENTICATED';

export interface SecurityContext {
  user?: {
    id: string;
    tenantId: string;
    attributes?: Record<string, unknown>;
  };
  ip: string | null;
  userAgent?: string;
  correlationId: string;
  runtime: 'edge' | 'node';
  environment: 'development' | 'test' | 'production';
  requestId: string;
  readinessStatus: ReadinessStatus;
}

/**
 * Builds the security context from the current request and session.
 * Designed to be used in Server Components, Server Actions, and Route Handlers.
 * Decoupled from direct Auth providers via the DI Container.
 *
 * SecurityContext captures technical request facts only:
 * - who is asking (identity id, tenant id)
 * - from where (ip, userAgent, correlationId, requestId)
 * - runtime metadata
 *
 * Role resolution and authorization precomputation belong in AuthorizationService.
 */
export async function createSecurityContext(
  dependencies: NodeSecurityContextDependencies,
): Promise<SecurityContext> {
  const {
    identityProvider,
    tenantResolver,
    userRepository,
    requestIdentitySource,
  } = dependencies;

  const headerList = await headers();
  // SEC-43. `null` when the client cannot be identified under the declared
  // trust model. This value reaches `audit_log.ip`, and a row naming an
  // address the request may never have come from is worse than one that
  // admits it does not know.
  const ip = auditIpForClient(await getClientIp(headerList));
  const userAgent = headerList.get('user-agent') ?? undefined;
  const correlationId =
    headerList.get('x-correlation-id') ?? crypto.randomUUID();
  const requestId = headerList.get('x-request-id') ?? crypto.randomUUID();

  const baseContext = {
    ip,
    userAgent,
    correlationId,
    requestId,
    runtime:
      typeof process !== 'undefined' && process.release?.name === 'node'
        ? ('node' as const)
        : ('edge' as const),
    environment: env.NODE_ENV as 'development' | 'test' | 'production',
  };

  let identity;
  try {
    identity = await identityProvider.getCurrentIdentity();
  } catch (err) {
    if (err instanceof UserNotProvisionedError) {
      return {
        ...baseContext,
        user: undefined,
        readinessStatus: 'BOOTSTRAP_REQUIRED',
      };
    }
    throw err;
  }

  if (!identity) {
    return {
      ...baseContext,
      user: undefined,
      readinessStatus: 'UNAUTHENTICATED',
    };
  }

  const user = await userRepository.findById(identity.id);

  if (!user) {
    return {
      ...baseContext,
      user: undefined,
      readinessStatus: 'BOOTSTRAP_REQUIRED',
    };
  }

  // Lifecycle authorization gate, checked before onboarding-completeness so
  // a deactivated-but-incomplete-onboarding account can never reach a more
  // permissive status -- same enforcement point and same reasoning as
  // `evaluateNodeProvisioningAccess`. Server Actions built on
  // `createSecureAction` build their `SecurityContext` from this function,
  // not from `evaluateNodeProvisioningAccess`, so this repository has two
  // independent readiness evaluators and both must check `deactivatedAt`.
  // See SEC-33 in docs/ai/general/SECURITY_CODING_PATTERNS.md.
  if (user.deactivatedAt) {
    return {
      ...baseContext,
      user: undefined,
      readinessStatus: 'ACCOUNT_DISABLED',
    };
  }

  // Session-revocation gate. This is the second of this repository's two
  // independent readiness evaluators, so -- exactly as with `deactivatedAt`
  // under SEC-33 -- the check has to exist here too or Server Actions would
  // keep honouring a session the API layer already rejects. Ordered after
  // the deactivation gate for the same reason as in
  // node-provisioning-access.ts: a disabled account must not be told merely
  // to sign in again.
  //
  // The identity source is consulted ONLY when this user actually carries a
  // marker. Almost nobody does (it is set by password reset alone), so the
  // common path costs nothing, and a provider whose session lookup is
  // unavailable in this context cannot turn an ordinary request into a
  // failure. See SEC-36.
  if (user.sessionsValidFrom) {
    const { sessionIssuedAt } = await requestIdentitySource.get();

    if (isSessionRevoked(user.sessionsValidFrom, sessionIssuedAt)) {
      return {
        ...baseContext,
        user: undefined,
        readinessStatus: 'UNAUTHENTICATED',
      };
    }
  }

  if (!user.onboardingComplete) {
    return {
      ...baseContext,
      user: undefined,
      readinessStatus: 'ONBOARDING_REQUIRED',
    };
  }

  try {
    const tenantContext = await tenantResolver.resolve(identity);
    return {
      ...baseContext,
      user: {
        id: identity.id,
        tenantId: tenantContext.tenantId,
      },
      readinessStatus: 'ALLOWED',
    };
  } catch (err) {
    if (
      err instanceof MissingTenantContextError ||
      err instanceof TenantNotProvisionedError
    ) {
      return {
        ...baseContext,
        user: undefined,
        readinessStatus: 'TENANT_CONTEXT_REQUIRED',
      };
    }
    if (err instanceof TenantMembershipRequiredError) {
      return {
        ...baseContext,
        user: undefined,
        readinessStatus: 'TENANT_MEMBERSHIP_REQUIRED',
      };
    }
    throw err;
  }
}

export const getSecurityContext = createSecurityContext;
