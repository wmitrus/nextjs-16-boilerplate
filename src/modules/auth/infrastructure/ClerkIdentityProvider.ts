import { auth } from '@clerk/nextjs/server';

import type { Identity, IdentityProvider } from '@/core/contracts/identity';

export class ClerkIdentityProvider implements IdentityProvider {
  async getCurrentIdentity(): Promise<Identity | null> {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      return null;
    }

    return {
      id: userId,
      email: sessionClaims?.email as string | undefined,
      attributes: {
        ...((sessionClaims?.metadata as Record<string, unknown>) || {}),
        orgId: (sessionClaims as unknown as { org_id?: string })?.org_id,
      },
    };
  }
}
