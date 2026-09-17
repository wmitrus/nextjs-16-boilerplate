import 'server-only';

import type { AuditEventInput } from '@/core/contracts/audit-log';
import type { DrizzleDb } from '@/core/db/types';
import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';

import { resolveCanonicalAuditWriteScope } from './resolve-canonical-audit-write-scope';

import { recordAdminAuditEvent } from '@/security/actions/record-admin-audit-event';

const logger = resolveServerLogger().child({
  type: 'API',
  category: 'audit',
  module: 'canonical-admin-audit',
});

export interface RecordCanonicalOrganizationAdminAuditEventInput {
  readonly db: DrizzleDb;
  readonly organizationCandidate: string;
  readonly legacyTenantId: string | null;
  readonly event: Omit<AuditEventInput, 'writeScope' | 'legacyTenantId'>;
}

/**
 * OZI-71 AUD·B composition seam for ancillary organization-owned audit events.
 *
 * Canonical ownership is resolved before the audit write from authoritative
 * organization evidence. Resolution failure drops only the audit event:
 * it must never reattribute an organization event as platform-global and must
 * never turn an already-completed business mutation into a failed operation.
 */
export async function recordCanonicalOrganizationAdminAuditEvent(
  input: RecordCanonicalOrganizationAdminAuditEventInput,
): Promise<void> {
  try {
    const canonical = await resolveCanonicalAuditWriteScope({
      // The candidate is explicitly organization-owned. `false` selects the
      // fail-closed unresolved/ambiguous behavior; it does not describe the
      // caller's platform-admin capability.
      isPlatformAdmin: false,
      ordinaryActiveOrganizationId: input.organizationCandidate,
      platformTargetOrganizationId: null,
      db: input.db,
      authProvider: env.AUTH_PROVIDER,
    });

    if (canonical.outcome !== 'resolved') {
      logger.warn(
        {
          event: 'canonical_admin_audit:dropped',
          category: input.event.category,
          action: input.event.action,
          reason: 'unresolvable-organization-target',
        },
        'Audit event dropped because canonical organization ownership could not be resolved',
      );
      return;
    }

    await recordAdminAuditEvent({
      ...input.event,
      writeScope: canonical.writeScope,
      legacyTenantId: input.legacyTenantId,
    });
  } catch (error) {
    logger.warn(
      {
        event: 'canonical_admin_audit:dropped',
        category: input.event.category,
        action: input.event.action,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
      'Audit event dropped because canonical ownership classification failed',
    );
  }
}
