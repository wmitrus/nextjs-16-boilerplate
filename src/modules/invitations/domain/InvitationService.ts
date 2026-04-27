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

  revokeInvitation(id: string): Promise<void>;

  listByOrganization(organizationId: string): Promise<Invitation[]>;
}
