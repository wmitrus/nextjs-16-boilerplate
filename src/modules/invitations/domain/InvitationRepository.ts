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

  /**
   * Atomically revokes a **pending** invitation that belongs to
   * `organizationId`, returning the revoked row or `null` if no row matched.
   *
   * The organization is part of the same UPDATE predicate on purpose. A
   * `SELECT id + organizationId` followed by `UPDATE ... WHERE id` is two
   * statements with a window between them, and the second one carries no
   * scope of its own -- so it authorises on data that was true a moment ago.
   * `status = 'pending'` is in the predicate for the same reason: it makes
   * revoking idempotent and single-shot rather than re-writing a row that
   * was already revoked or accepted. See SEC-41.
   *
   * `organizationId: null` means an unscoped platform-admin revoke, mirroring
   * `AdminUserScope` in `DrizzleAdminUsersService` (SEC-26).
   */
  revokePendingScoped(
    id: string,
    organizationId: string | null,
  ): Promise<Invitation | null>;

  markExpired(id: string): Promise<void>;
}
