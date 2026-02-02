export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      onboardingComplete?: boolean;
      targetLanguage?: string;
      proficiencyLevel?: string;
      learningGoal?: string;
    };
  }
}
