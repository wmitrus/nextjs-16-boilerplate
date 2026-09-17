import 'server-only';

import type { AuditWriteScope } from '@/core/contracts/audit-log';
import {
  internalOrganizationIdFromOrgRow,
  isCanonicalIdRepresentation,
  parentTenantIdFromOrgRow,
} from '@/core/contracts/canonical-ids.provenance';
import type { ExternalAuthProvider } from '@/core/contracts/identity';
import type { DrizzleDb } from '@/core/db/types';

import { AuditCanonicalWriteInvariantError } from '@/modules/audit-log/domain/errors';
import { DrizzleInternalIdentityLookup } from '@/modules/auth/infrastructure/drizzle/DrizzleInternalIdentityLookup';
import { DrizzleOrganizationScopeAuthority } from '@/modules/authorization/infrastructure/drizzle/DrizzleOrganizationScopeAuthority';

/**
 * OZI-71 AUD·B — shared server-only composition seam that classifies an Audit
 * write using authoritative organization evidence.
 *
 * The legacy audit `tenant_id` compatibility key is deliberately NOT used as
 * canonical authority. Organization ownership always carries both the
 * internal organization id and its independently loaded parent tenant id.
 */
export type CanonicalAuditWriteResolution =
  | {
      readonly outcome: 'resolved';
      readonly writeScope: AuditWriteScope;
    }
  | {
      readonly outcome: 'unresolvable-organization-target';
    };

export interface ResolveCanonicalAuditWriteScopeInput {
  readonly isPlatformAdmin: boolean;
  readonly ordinaryActiveOrganizationId: string;
  readonly platformTargetOrganizationId: string | null;
  readonly db: DrizzleDb;
  readonly authProvider: ExternalAuthProvider;
}

type OrganizationWriteScope = Extract<
  AuditWriteScope,
  { kind: 'organization' }
>;

type CandidateEvidence =
  | {
      readonly kind: 'resolved';
      readonly writeScope: OrganizationWriteScope;
    }
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'ambiguous' };

export async function resolveCanonicalAuditWriteScope(
  input: ResolveCanonicalAuditWriteScopeInput,
): Promise<CanonicalAuditWriteResolution> {
  const authority = new DrizzleOrganizationScopeAuthority(input.db);

  if (!input.isPlatformAdmin) {
    const evidence = await resolveCandidateEvidence(
      input.ordinaryActiveOrganizationId,
      input.authProvider,
      input.db,
      authority,
    );

    if (evidence.kind !== 'resolved') {
      // An ordinary organization-context writer may never degrade into a
      // platform-global audit write when canonical resolution fails.
      throw new AuditCanonicalWriteInvariantError();
    }

    return {
      outcome: 'resolved',
      writeScope: evidence.writeScope,
    };
  }

  if (input.platformTargetOrganizationId === null) {
    return {
      outcome: 'resolved',
      writeScope: { kind: 'platform-global' },
    };
  }

  const evidence = await resolveCandidateEvidence(
    input.platformTargetOrganizationId,
    input.authProvider,
    input.db,
    authority,
  );

  if (evidence.kind !== 'resolved') {
    return { outcome: 'unresolvable-organization-target' };
  }

  return {
    outcome: 'resolved',
    writeScope: evidence.writeScope,
  };
}

async function resolveCandidateEvidence(
  candidate: string,
  authProvider: ExternalAuthProvider,
  db: DrizzleDb,
  authority: DrizzleOrganizationScopeAuthority,
): Promise<CandidateEvidence> {
  const internalMatch = await verifyInternalOrganization(candidate, authority);

  const lookup = new DrizzleInternalIdentityLookup(db);
  const providerMappedId = await lookup.findInternalOrganizationId(
    authProvider,
    candidate,
  );

  const providerMatch =
    providerMappedId === null
      ? null
      : await verifyInternalOrganization(providerMappedId, authority);

  if (providerMappedId !== null && providerMatch === null) {
    throw new AuditCanonicalWriteInvariantError();
  }

  if (internalMatch === null && providerMatch === null) {
    return { kind: 'unresolved' };
  }

  if (
    internalMatch !== null &&
    providerMatch !== null &&
    internalMatch.organizationId !== providerMatch.organizationId
  ) {
    return { kind: 'ambiguous' };
  }

  const writeScope = internalMatch ?? providerMatch;
  if (writeScope === null) {
    throw new AuditCanonicalWriteInvariantError();
  }

  return {
    kind: 'resolved',
    writeScope,
  };
}

async function verifyInternalOrganization(
  candidate: string,
  authority: DrizzleOrganizationScopeAuthority,
): Promise<OrganizationWriteScope | null> {
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
