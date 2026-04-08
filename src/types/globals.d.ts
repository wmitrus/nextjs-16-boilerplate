export {};

declare global {
  interface CustomJwtSessionClaims {
    email?: string;
    primaryEmail?: string;
    metadata: {
      onboardingComplete?: boolean;
      displayName?: string;
      locale?: string;
      timezone?: string;
    };
  }
}
