import 'server-only';

import { AUTH, AUTHORIZATION } from '@/core/contracts';
import type { OrganizationScopeAuthority } from '@/core/contracts/access-scope-authority';
import type { AuditWriteScope } from '@/core/contracts/audit-log';
import {
  internalOrganizationIdFromOrgRow,
  isCanonicalIdRepresentation,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';
import type { InternalIdentityLookup } from '@/core/contracts/identity';
import { env } from '@/core/env';
import { getAppContainer } from '@/core/runtime/bootstrap';

type OrganizationAuditWriteScope = Extract<
  AuditWriteScope,
  { kind: 'organization' }
>;

/**
 * OZI-71 AUD·B authoritative canonical organization resolution for writers
 * inside the security layer.
 *
 * The candidate's provenance is never assumed. Both authoritative evidence
 * paths are attempted:
 * - candidate as an internal organizations.id;
 * - candidate as a provider external organization id.
 *
 * Parent tenant identity is always read independently through
 * OrganizationScopeAuthority. Any unresolved, stale or ambiguous evidence
 * fails closed by returning null; callers must drop the DB audit event rather
 * than reattribute it as platform-global.
 */
export async function resolveCanonicalOrganizationAuditWriteScope(
  candidate: string,
): Promise<OrganizationAuditWriteScope | null> {
  const container = getAppContainer();

  const authority = container.resolve<OrganizationScopeAuthority>(
    AUTHORIZATION.ORGANIZATION_SCOPE_AUTHORITY,
  );
  const lookup = container.resolve<InternalIdentityLookup>(
    AUTH.INTERNAL_IDENTITY_LOOKUP,
  );

  const internalMatch = await verifyInternalOrganization(candidate, authority);

  const providerMappedId = await lookup.findInternalOrganizationId(
    env.AUTH_PROVIDER,
    candidate,
  );

  const providerMatch =
    providerMappedId === null
      ? null
      : await verifyInternalOrganization(providerMappedId, authority);

  // A provider mapping that points at no live internal organization is stale
  // authority evidence. Never fall back to global or to the other candidate.
  if (providerMappedId !== null && providerMatch === null) {
    return null;
  }

  if (internalMatch === null && providerMatch === null) {
    return null;
  }

  if (
    internalMatch !== null &&
    providerMatch !== null &&
    internalMatch.organizationId !== providerMatch.organizationId
  ) {
    return null;
  }

  return internalMatch ?? providerMatch;
}

async function verifyInternalOrganization(
  candidate: string,
  authority: OrganizationScopeAuthority,
): Promise<OrganizationAuditWriteScope | null> {
  if (!isCanonicalIdRepresentation(candidate)) {
    return null;
  }

  const parentTenantId = await authority.readParentTenantId(candidate);
  if (parentTenantId === null) {
    return null;
  }

  return {
    kind: 'organization',
    organizationId: internalOrganizationIdFromOrgRow(candidate),
    tenantId: parentTenantIdFromOrgRow(parentTenantId),
  };
}
