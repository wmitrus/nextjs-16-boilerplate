import type { CreateInvitationData, Invitation } from './types';

export interface InvitationRepository {
  create(data: CreateInvitationData): Promise<Invitation>;

  findByToken(token: string): Promise<Invitation | null>;

  findPendingByEmailAndOrg(
    email: string,
    organizationId: string,
  ): Promise<Invitation | null>;

  listByOrganization(organizationId: string): Promise<Invitation[]>;

  markAccepted(id: string, acceptedAt: Date): Promise<Invitation | null>;

  markRevoked(id: string): Promise<void>;

  markExpired(id: string): Promise<void>;
}
