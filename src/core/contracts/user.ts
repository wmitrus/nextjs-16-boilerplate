import type { SubjectId } from './primitives';

/**
 * User aggregate — represents the domain-specific user data.
 */
export interface User {
  readonly id: SubjectId;
  readonly email?: string;
  readonly onboardingComplete: boolean;
  readonly displayName?: string;
  readonly locale?: string;
  readonly timezone?: string;
  readonly deactivatedAt?: Date;
  /**
   * Sessions issued before this instant are rejected. Set by account-security
   * events (today: a completed password reset). Undefined/null means nothing
   * has ever been revoked for this user. See SEC-36.
   */
  readonly sessionsValidFrom?: Date | null;
  readonly createdAt?: Date;
}

/**
 * Repository for managing user domain entities.
 */
export interface UserRepository {
  /**
   * Retrieves a user by their unique identifier.
   */
  findById(id: SubjectId): Promise<User | null>;

  /**
   * Retrieves a user by email, or `null` if no user has activated with this
   * address yet. Used to check whether an email already resolved to a real
   * account through a path other than the one currently being reviewed (e.g.
   * a waitlist entry whose applicant became a user via direct invite or
   * platform-admin bootstrap) -- see OZI-64.
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Updates the onboarding status for a user.
   */
  updateOnboardingStatus(id: SubjectId, complete: boolean): Promise<void>;

  /**
   * Updates the user's profile information.
   */
  updateProfile(
    id: SubjectId,
    profile: {
      readonly displayName?: string;
      readonly locale?: string;
      readonly timezone?: string;
    },
  ): Promise<void>;

  /**
   * Lists all users with optional pagination and search.
   */
  listAll(options?: {
    readonly limit?: number;
    readonly offset?: number;
    readonly search?: string;
  }): Promise<{ users: User[]; total: number }>;

  /**
   * Soft-deactivates a user by setting the deactivatedAt timestamp.
   */
  deactivate(id: SubjectId, deactivatedAt: Date): Promise<void>;
}
