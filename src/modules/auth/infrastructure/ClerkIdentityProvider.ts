import { auth } from '@clerk/nextjs/server';

import type { Identity, IdentityProvider } from '@/core/contracts/identity';

interface ClerkMetadata {
  onboardingComplete?: boolean;
  [key: string]: unknown;
}

interface ClerkSessionClaims {
  email?: string;
  metadata?: ClerkMetadata;
  org_id?: string;
}

export class ClerkIdentityProvider implements IdentityProvider {
  async getCurrentIdentity(): Promise<Identity | null> {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return null;
    }

    const claims = sessionClaims as unknown as ClerkSessionClaims;

    return {
      id: userId,
      email: claims?.email,
    };
  }
}
