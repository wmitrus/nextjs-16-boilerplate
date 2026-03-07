export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      onboardingComplete?: boolean;
      displayName?: string;
      locale?: string;
      timezone?: string;
    };
  }
}
