import type { SubjectId } from './primitives';

/**
 * User aggregate — represents the domain-specific user data.
 */
export interface User {
  readonly id: SubjectId;
  readonly email?: string;
  readonly onboardingComplete: boolean;
  readonly targetLanguage?: string;
  readonly proficiencyLevel?: string;
  readonly learningGoal?: string;
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
      readonly targetLanguage?: string;
      readonly proficiencyLevel?: string;
      readonly learningGoal?: string;
    },
  ): Promise<void>;
}
