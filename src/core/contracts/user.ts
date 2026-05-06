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
