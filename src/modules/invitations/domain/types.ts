export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  readonly id: string;
  readonly organizationId: string;
  readonly invitedByUserId: string | null;
  readonly email: string;
  readonly roleId: string;
  readonly token: string;
  readonly status: InvitationStatus;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateInvitationData {
  readonly organizationId: string;
  readonly invitedByUserId: string | null;
  readonly email: string;
  readonly roleId: string;
  readonly token: string;
  readonly expiresAt: Date;
}
