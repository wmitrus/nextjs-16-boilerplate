import type { Action } from '@/core/contracts/authorization';
import { ACTIONS } from '@/core/contracts/resources-actions';
import { logger } from '@/core/logger/server';

type ScopeKind = 'organization' | 'active-tenant';
export type OrganizationBoundarySurface =
  | 'organization'
  | 'members'
  | 'roles'
  | 'invitations'
  | 'policies';
type ActionFamily =
  | 'tenant-update'
  | 'tenant-manage-members'
  | 'security-manage-policies'
  | 'other';
type Event =
  | {
      stage: 'action';
      decision: 'allowed' | 'denied';
      scopeKind: ScopeKind;
      actionFamily: ActionFamily;
    }
  | {
      stage: 'scope';
      decision: 'hit' | 'miss';
      scopeKind: ScopeKind;
      surface: OrganizationBoundarySurface;
    };

export function getOrganizationActionFamily(action: Action): ActionFamily {
  switch (action) {
    case ACTIONS.TENANT_UPDATE:
      return 'tenant-update';
    case ACTIONS.TENANT_MANAGE_MEMBERS:
      return 'tenant-manage-members';
    case ACTIONS.SECURITY_MANAGE_POLICIES:
      return 'security-manage-policies';
    default:
      return 'other';
  }
}

export function recordOrganizationBoundaryDecision(event: Event): void {
  try {
    logger.info({ event: 'security:organization_boundary_decision', ...event });
  } catch {
    // Observability must never affect authorization or request handling.
  }
}
