import type { Invitation } from './types';

export interface CreateInvitationInput {
  readonly organizationId: string;
  readonly invitedByUserId: string | null;
  readonly email: string;
  readonly roleId: string;
  readonly expiresInHours?: number;
}

export interface AcceptInvitationInput {
  readonly token: string;
  readonly acceptedAt?: Date;
}

export interface InvitationService {
  createInvitation(input: CreateInvitationInput): Promise<Invitation>;

  validateToken(token: string): Promise<Invitation>;

  acceptInvitation(input: AcceptInvitationInput): Promise<Invitation>;

  /**
   * Revokes a pending invitation within `organizationId` (or unscoped when
   * `null`, for a platform admin). Returns `false` when nothing matched --
   * wrong organization, already revoked, or no such invitation -- which the
   * caller must surface identically so the outcomes stay indistinguishable.
   */
  revokeInvitation(id: string, organizationId: string | null): Promise<boolean>;

  listByOrganization(organizationId: string): Promise<Invitation[]>;
}
